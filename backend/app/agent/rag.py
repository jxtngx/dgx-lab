from __future__ import annotations

import fnmatch
import logging
import threading
from pathlib import Path

from app import config

log = logging.getLogger(__name__)

_IGNORE_DIRS = {"node_modules", ".venv", "__pycache__", ".git", ".next", ".turbo", "dist", "build", ".cache"}
_IGNORE_PATTERNS: list[str] = []
_BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot",
    ".pdf", ".zip", ".tar", ".gz", ".bz2",
    ".pyc", ".pyo", ".so", ".dylib", ".dll",
    ".lock", ".lockb",
}
_TEXT_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".md", ".mdx", ".json", ".yaml", ".yml", ".toml",
    ".html", ".css", ".sh", ".bash", ".zsh",
    ".dockerfile", ".conf", ".cfg", ".ini", ".env.example",
    ".mdc",
}

_index_lock = threading.Lock()
_vectorstore = None
_faiss_gpu_available: bool | None = None


def _check_faiss_gpu() -> bool:
    global _faiss_gpu_available
    if _faiss_gpu_available is not None:
        return _faiss_gpu_available
    try:
        import faiss
        _faiss_gpu_available = hasattr(faiss, "StandardGpuResources")
        if _faiss_gpu_available:
            log.info("FAISS GPU (cuVS) backend detected")
        else:
            log.info("FAISS CPU backend detected")
    except ImportError:
        _faiss_gpu_available = False
    return _faiss_gpu_available


def _load_cursorignore() -> list[str]:
    ignore_file = config.CODEBASE_ROOT / ".cursorignore"
    if not ignore_file.exists():
        return []
    patterns = []
    for line in ignore_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("!"):
            continue
        patterns.append(line)
    return patterns


def _should_ignore(path: Path, root: Path) -> bool:
    if any(part in _IGNORE_DIRS for part in path.parts):
        return True
    if path.suffix in _BINARY_EXTENSIONS:
        return True
    if path.suffix and path.suffix not in _TEXT_EXTENSIONS:
        return True

    rel = str(path.relative_to(root))
    for pattern in _IGNORE_PATTERNS:
        if fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(path.name, pattern):
            return True
    return False


def _collect_documents() -> list:
    from langchain_core.documents import Document

    global _IGNORE_PATTERNS
    _IGNORE_PATTERNS = _load_cursorignore()

    root = config.CODEBASE_ROOT
    docs: list[Document] = []

    if not root.exists():
        log.warning("Codebase root does not exist: %s", root)
        return docs

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if _should_ignore(path, root):
            continue
        try:
            content = path.read_text(errors="replace")
            if not content.strip():
                continue
            if len(content) > 500_000:
                content = content[:500_000]

            rel_path = str(path.relative_to(root))
            metadata = {
                "source": rel_path,
                "file_type": path.suffix,
            }

            if rel_path.startswith(".cursor/agents/"):
                metadata["doc_type"] = "agent_persona"
                metadata["boost"] = 2.0
            elif rel_path.startswith(".cursor/skills/"):
                metadata["doc_type"] = "skill"
                metadata["boost"] = 2.0
            elif rel_path.startswith("backend/"):
                metadata["doc_type"] = "backend"
            elif rel_path.startswith("frontend/"):
                metadata["doc_type"] = "frontend"
            elif rel_path.startswith("docs/"):
                metadata["doc_type"] = "documentation"
                metadata["boost"] = 1.5
            else:
                metadata["doc_type"] = "config"

            docs.append(Document(page_content=content, metadata=metadata))
        except (OSError, UnicodeDecodeError):
            continue

    log.info("Collected %d documents from %s", len(docs), root)
    return docs


def _split_documents(docs: list) -> list:
    from langchain_text_splitters import RecursiveCharacterTextSplitter, Language

    splitter_map = {
        ".py": RecursiveCharacterTextSplitter.from_language(
            language=Language.PYTHON, chunk_size=1500, chunk_overlap=200
        ),
        ".ts": RecursiveCharacterTextSplitter.from_language(
            language=Language.TS, chunk_size=1500, chunk_overlap=200
        ),
        ".tsx": RecursiveCharacterTextSplitter.from_language(
            language=Language.TS, chunk_size=1500, chunk_overlap=200
        ),
        ".md": RecursiveCharacterTextSplitter.from_language(
            language=Language.MARKDOWN, chunk_size=2000, chunk_overlap=300
        ),
    }

    default_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1500, chunk_overlap=200
    )

    chunks = []
    for doc in docs:
        ext = doc.metadata.get("file_type", "")
        splitter = splitter_map.get(ext, default_splitter)
        splits = splitter.split_documents([doc])
        chunks.extend(splits)

    log.info("Split into %d chunks", len(chunks))
    return chunks


def _get_embeddings():
    from langchain_community.embeddings import HuggingFaceEmbeddings

    return HuggingFaceEmbeddings(
        model_name="nvidia/llama-embed-nemotron-8b",
        model_kwargs={"device": "cuda"},
        encode_kwargs={"normalize_embeddings": True},
    )


def _move_index_to_gpu(vectorstore):
    """Move FAISS index to GPU if cuVS backend is available."""
    if not _check_faiss_gpu():
        return vectorstore
    try:
        import faiss
        cpu_index = vectorstore.index
        res = faiss.StandardGpuResources()
        res.noTempMemory()
        gpu_index = faiss.index_cpu_to_gpu(res, 0, cpu_index)
        vectorstore.index = gpu_index
        log.info("FAISS index moved to GPU (cuVS accelerated)")
    except Exception as exc:
        log.warning("Failed to move index to GPU, using CPU: %s", exc)
    return vectorstore


def build_index(force: bool = False):
    global _vectorstore

    with _index_lock:
        if _vectorstore is not None and not force:
            return _vectorstore

        from langchain_community.vectorstores import FAISS

        index_path = config.AGENT_INDEX_DIR / "faiss-index"
        embeddings = _get_embeddings()

        if index_path.exists() and not force:
            try:
                _vectorstore = FAISS.load_local(
                    str(index_path),
                    embeddings,
                    allow_dangerous_deserialization=True,
                )
                log.info("Loaded FAISS index from %s", index_path)
                _vectorstore = _move_index_to_gpu(_vectorstore)
                return _vectorstore
            except Exception as exc:
                log.warning("Failed to load saved index, rebuilding: %s", exc)

        docs = _collect_documents()
        if not docs:
            log.warning("No documents found to index")
            return None

        chunks = _split_documents(docs)
        _vectorstore = FAISS.from_documents(chunks, embeddings)

        index_path.parent.mkdir(parents=True, exist_ok=True)
        _vectorstore.save_local(str(index_path))
        log.info("Built and saved FAISS index to %s (%d chunks)", index_path, len(chunks))
        _vectorstore = _move_index_to_gpu(_vectorstore)
        return _vectorstore


def _get_reranker():
    from langchain.retrievers.document_compressors import CrossEncoderReranker
    from langchain_community.cross_encoders import HuggingFaceCrossEncoder

    model = HuggingFaceCrossEncoder(
        model_name="nvidia/llama-nemotron-rerank-1b-v2",
        model_kwargs={"device": "cuda"},
    )
    return CrossEncoderReranker(model=model, top_n=6)


def get_retriever(k: int = 20):
    vs = build_index()
    if vs is None:
        return None

    from langchain.retrievers import ContextualCompressionRetriever

    base_retriever = vs.as_retriever(search_kwargs={"k": k})
    reranker = _get_reranker()

    return ContextualCompressionRetriever(
        base_compressor=reranker,
        base_retriever=base_retriever,
    )
