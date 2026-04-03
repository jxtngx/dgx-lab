from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from huggingface_hub import HfApi, scan_cache_dir
from huggingface_hub.utils import HfHubHTTPError
from pydantic import BaseModel

from app import config

logger = logging.getLogger(__name__)
router = APIRouter()
hf_api = HfApi()

_downloads: dict[str, dict] = {}
_download_threads: dict[str, threading.Thread] = {}


def _bytes_to_gb(b: int) -> float:
    return round(b / (1024**3), 2)


def _read_model_config(repo_path: Path) -> dict | None:
    for snapshot in sorted(repo_path.glob("snapshots/*/"), reverse=True):
        cfg = snapshot / "config.json"
        if cfg.exists():
            try:
                return json.loads(cfg.read_text())
            except (json.JSONDecodeError, OSError):
                continue
    return None


def _estimate_memory_gb(cfg: dict, quant: str | None = None) -> float | None:
    """Rough per-parameter memory estimate based on dtype/quantization."""
    params = cfg.get("num_parameters")
    if not params:
        hidden = cfg.get("hidden_size", 0)
        layers = cfg.get("num_hidden_layers", 0)
        intermediate = cfg.get("intermediate_size", hidden * 4)
        vocab = cfg.get("vocab_size", 0)
        if hidden and layers:
            params = layers * (4 * hidden * hidden + 2 * hidden * intermediate) + vocab * hidden * 2

    if not params:
        return None

    bytes_per_param = {
        "fp32": 4, "fp16": 2, "bf16": 2, "fp8": 1, "fp4": 0.5,
        "int8": 1, "int4": 0.5, "q4_k_m": 0.55, "q5_k_m": 0.65,
        "q8_0": 1.1, "gptq": 0.55, "awq": 0.55, "gguf": 0.55,
    }
    bpp = bytes_per_param.get((quant or "fp16").lower(), 2)
    return round(params * bpp / (1024**3), 1)


@router.delete("/models/{model_id:path}")
async def delete_model(model_id: str):
    """Remove a model from the local HuggingFace cache."""
    try:
        cache = scan_cache_dir(config.MODELS_DIR)
    except Exception:
        cache = scan_cache_dir()

    hashes_to_delete = set()
    found = False
    for repo in cache.repos:
        if repo.repo_id == model_id and repo.repo_type == "model":
            found = True
            for revision in repo.revisions:
                hashes_to_delete.add(revision.commit_hash)

    if not found:
        raise HTTPException(status_code=404, detail="Model not found in local cache")

    strategy = cache.delete_revisions(*hashes_to_delete)
    freed = strategy.expected_freed_size
    strategy.execute()

    return {"status": "ok", "id": model_id, "freed_gb": round(freed / (1024**3), 2)}


class PullRequest(BaseModel):
    repo_id: str
    revision: str | None = None


def _cache_folder(repo_id: str) -> Path:
    return config.MODELS_DIR / ("models--" + repo_id.replace("/", "--"))


def _dir_size_bytes(p: Path) -> int:
    if not p.exists():
        return 0
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


def _scan_interrupted() -> None:
    """Detect partially downloaded models by looking for .incomplete marker files."""
    if not config.MODELS_DIR.exists():
        return

    try:
        cache = scan_cache_dir(config.MODELS_DIR)
        complete_ids = {r.repo_id for r in cache.repos if r.repo_type == "model"}
    except Exception:
        complete_ids = set()

    for model_dir in config.MODELS_DIR.glob("models--*"):
        if not model_dir.is_dir():
            continue
        repo_id = model_dir.name.replace("models--", "", 1).replace("--", "/", 1)

        if repo_id in _downloads:
            continue

        incomplete_files = list(model_dir.rglob("*.incomplete"))
        blobs_dir = model_dir / "blobs"
        has_blobs = blobs_dir.exists() and any(blobs_dir.iterdir()) if blobs_dir.exists() else False

        if incomplete_files or (has_blobs and repo_id not in complete_ids):
            current_bytes = _dir_size_bytes(model_dir)
            _downloads[repo_id] = {
                "status": "interrupted",
                "started_at": model_dir.stat().st_mtime,
                "finished_at": None,
                "expected_bytes": 0,
                "downloaded_bytes": current_bytes,
                "error": None,
            }


_scan_interrupted()


def _reconcile_downloads() -> list[str]:
    """Check tracked downloads against the HF cache and promote finished ones."""
    try:
        cache = scan_cache_dir(config.MODELS_DIR)
        complete_ids = {r.repo_id for r in cache.repos if r.repo_type == "model"}
    except Exception:
        complete_ids = set()

    resolved = []
    for repo_id in list(_downloads):
        info = _downloads[repo_id]
        if info["status"] not in ("downloading", "interrupted"):
            continue

        # If a thread is still alive, don't touch it
        t = _download_threads.get(repo_id)
        if t and t.is_alive():
            continue

        model_dir = _cache_folder(repo_id)

        if not model_dir.exists():
            del _downloads[repo_id]
            resolved.append(repo_id)
            continue

        has_incomplete = bool(list(model_dir.rglob("*.incomplete")))

        if repo_id in complete_ids and not has_incomplete:
            _downloads[repo_id] = {
                "status": "complete",
                "started_at": info.get("started_at"),
                "finished_at": time.time(),
                "expected_bytes": info.get("expected_bytes", 0),
                "error": None,
            }
            resolved.append(repo_id)

    return resolved


def _do_download(repo_id: str, revision: str | None) -> None:
    existing = _downloads.get(repo_id)

    expected_bytes = 0
    try:
        info = hf_api.model_info(repo_id, files_metadata=True)
        expected_bytes = sum(s.size for s in info.siblings if s.size) or 0
    except Exception:
        pass

    _downloads[repo_id] = {
        "status": "downloading",
        "started_at": time.time(),
        "expected_bytes": expected_bytes,
        "error": None,
        "resumed": existing is not None and existing.get("status") in ("interrupted", "error"),
    }
    try:
        path = hf_api.snapshot_download(
            repo_id=repo_id,
            revision=revision,
            cache_dir=str(config.MODELS_DIR),
        )
        _downloads[repo_id] = {
            "status": "complete",
            "path": str(path),
            "started_at": _downloads[repo_id]["started_at"],
            "finished_at": time.time(),
            "expected_bytes": expected_bytes,
            "error": None,
        }
    except Exception as exc:
        logger.exception("Download failed for %s", repo_id)
        _downloads[repo_id] = {
            "status": "interrupted",
            "error": str(exc),
            "started_at": _downloads[repo_id]["started_at"],
            "finished_at": time.time(),
            "expected_bytes": expected_bytes,
        }


# --- Fixed routes (must come before the {model_id:path} catch-all) ---

@router.get("/models")
async def list_models():
    try:
        cache = scan_cache_dir(config.MODELS_DIR)
    except Exception:
        cache = scan_cache_dir()

    models = []
    for repo in cache.repos:
        if repo.repo_type != "model":
            continue

        repo_path = Path(repo.repo_path)
        model_config = _read_model_config(repo_path)

        entry: dict = {
            "id": repo.repo_id,
            "size_on_disk_gb": _bytes_to_gb(repo.size_on_disk),
            "nb_files": repo.nb_files,
            "last_accessed": repo.last_accessed,
            "last_modified": repo.last_modified,
            "refs": [r.name if hasattr(r, "name") else str(r) for r in repo.refs],
            "status": "on_disk",
        }

        if model_config:
            entry["architecture"] = model_config.get("architectures", [None])[0] if model_config.get("architectures") else model_config.get("model_type")
            entry["hidden_size"] = model_config.get("hidden_size")
            entry["num_layers"] = model_config.get("num_hidden_layers")
            entry["vocab_size"] = model_config.get("vocab_size")
            entry["context_length"] = model_config.get("max_position_embeddings")
            entry["num_experts"] = model_config.get("num_local_experts")
            entry["num_experts_per_tok"] = model_config.get("num_experts_per_tok")
            entry["torch_dtype"] = model_config.get("torch_dtype")
            entry["quantization_config"] = model_config.get("quantization_config")

            mem = _estimate_memory_gb(model_config, model_config.get("torch_dtype"))
            if mem:
                entry["estimated_memory_gb"] = mem
                entry["fits_in_memory"] = mem <= config.MEMORY_TOTAL_GB

        models.append(entry)

    return models


@router.post("/models/pull")
async def pull_model(req: PullRequest):
    active = _downloads.get(req.repo_id)
    if active and active["status"] == "downloading":
        t = _download_threads.get(req.repo_id)
        if t and t.is_alive():
            return {"status": "already_downloading", "repo_id": req.repo_id}

    is_resume = active is not None and active.get("status") in ("interrupted", "error")

    thread = threading.Thread(
        target=_do_download,
        args=(req.repo_id, req.revision),
        daemon=True,
    )
    _download_threads[req.repo_id] = thread
    thread.start()
    return {"status": "resumed" if is_resume else "started", "repo_id": req.repo_id}


@router.get("/models/downloads")
async def list_downloads():
    _reconcile_downloads()
    result = {}
    for repo_id, info in _downloads.items():
        entry = {**info}
        if info["status"] == "downloading":
            current = _dir_size_bytes(_cache_folder(repo_id))
            expected = info.get("expected_bytes", 0)
            entry["downloaded_bytes"] = current
            entry["downloaded_gb"] = round(current / (1024**3), 2)
            entry["expected_gb"] = round(expected / (1024**3), 2) if expected else None
            entry["progress"] = min(round(current / expected, 4), 1.0) if expected else None
            entry["elapsed_s"] = round(time.time() - info["started_at"], 1)
        elif info["status"] == "interrupted":
            current = _dir_size_bytes(_cache_folder(repo_id))
            entry["downloaded_bytes"] = current
            entry["downloaded_gb"] = round(current / (1024**3), 2)
            expected = info.get("expected_bytes", 0)
            entry["expected_gb"] = round(expected / (1024**3), 2) if expected else None
            entry["progress"] = min(round(current / expected, 4), 1.0) if expected else None
        result[repo_id] = entry
    return result


@router.post("/models/reconcile")
async def reconcile_downloads():
    """Force re-check of all tracked downloads against the HF cache.

    Promotes downloads that finished (no .incomplete files, present in cache)
    to "complete" and clears them from the active tracker.
    """
    resolved = _reconcile_downloads()
    return {"resolved": resolved}


@router.get("/search")
async def search_hub(q: str = Query(..., min_length=1), limit: int = Query(20, le=50)):
    try:
        results = hf_api.list_models(search=q, limit=limit, sort="downloads")
        return [
            {
                "id": m.id,
                "downloads": m.downloads,
                "likes": m.likes,
                "pipeline_tag": m.pipeline_tag,
                "last_modified": str(m.last_modified) if m.last_modified else None,
            }
            for m in results
        ]
    except Exception as exc:
        logger.exception("Hub search failed")
        raise HTTPException(status_code=502, detail=str(exc))


# --- Catch-all route (must be last) ---

@router.get("/models/{model_id:path}")
async def get_model_detail(model_id: str):
    try:
        cache = scan_cache_dir(config.MODELS_DIR)
    except Exception:
        cache = scan_cache_dir()

    for repo in cache.repos:
        if repo.repo_id == model_id and repo.repo_type == "model":
            repo_path = Path(repo.repo_path)
            model_config = _read_model_config(repo_path)

            files = []
            for revision in repo.revisions:
                for f in revision.files:
                    size = f.blob_path.stat().st_size if f.blob_path.exists() else 0
                    files.append({
                        "name": str(f.file_name),
                        "size_bytes": size,
                        "size_mb": round(size / (1024 ** 2), 1),
                    })

            seen = set()
            unique_files = []
            for f in files:
                if f["name"] not in seen:
                    seen.add(f["name"])
                    unique_files.append(f)
            unique_files.sort(key=lambda f: f["name"])

            return {
                "id": repo.repo_id,
                "size_on_disk_gb": _bytes_to_gb(repo.size_on_disk),
                "config": model_config,
                "memory_total_gb": config.MEMORY_TOTAL_GB,
                "files": unique_files,
            }

    raise HTTPException(status_code=404, detail="Model not found in local cache")
