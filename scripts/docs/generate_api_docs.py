"""Generate API reference markdown from DGX Lab backend source using griffe.

Renders each module's public API (classes, functions, attributes) into
markdown files that the docs-site Docusaurus instance can consume.

Usage:
    python scripts/docs/generate_api_docs.py
"""

from __future__ import annotations

import re
from pathlib import Path

import griffe

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DOCS_DIR = REPO_ROOT / "docs-site" / "docs" / "api"
SRC_DIR = REPO_ROOT / "backend"

MODULES: dict[str, list[tuple[str, str]]] = {
    "routers": [
        ("app.routers.control", "Control"),
        ("app.routers.monitor", "Monitor"),
        ("app.routers.logger", "Logger"),
        ("app.routers.traces", "Traces"),
        ("app.routers.automodel", "AutoModel"),
        ("app.routers.designer", "Designer"),
        ("app.routers.curator", "Curator"),
        ("app.routers.datasets", "Datasets"),
        ("app.routers.langsmith_traces", "LangSmith Traces"),
        ("app.routers.agent_chat", "Agent Chat"),
        ("app.routers.claude_agents", "Claude Agents"),
        ("app.routers.agents", "Agents"),
    ],
    "agent": [
        ("app.agent.chain", "Agent Chain"),
        ("app.agent.rag", "RAG Pipeline"),
        ("app.agent.personas", "Personas"),
        ("app.agent.skills", "Skills"),
        ("app.agent.tracing", "Tracing"),
        ("app.agent.evals", "Evaluation"),
    ],
}

TOP_LEVEL_MODULES: list[tuple[str, str, str]] = [
    ("app.config", "Configuration", "config.md"),
]


def module_filename(module_path: str) -> str:
    return module_path.rsplit(".", 1)[-1] + ".md"


def escape_mdx(text: str) -> str:
    """Escape MDX-sensitive characters in prose while preserving fenced code blocks."""
    parts = re.split(r"(```.*?```)", text, flags=re.DOTALL)
    for i, part in enumerate(parts):
        if part.startswith("```"):
            continue
        part = part.replace("<", "&lt;").replace(">", "&gt;")
        part = part.replace("{", "&#123;").replace("}", "&#125;")
        parts[i] = part
    return "".join(parts)


def render_docstring(obj: griffe.Object) -> str:
    lines: list[str] = []
    doc = obj.docstring
    if doc and doc.value:
        lines.append(escape_mdx(doc.value.strip()))
        lines.append("")
    return "\n".join(lines)


def render_function(func: griffe.Function) -> str:
    lines: list[str] = []
    params = []
    for param in func.parameters:
        if param.name in ("self", "cls"):
            continue
        annotation = f": {param.annotation}" if param.annotation else ""
        default = f" = {param.default}" if param.default else ""
        params.append(f"{param.name}{annotation}{default}")

    sig = f"def {func.name}({', '.join(params)})"
    if func.returns:
        sig += f" -> {func.returns}"

    lines.append(f"### `{func.name}`")
    lines.append("")
    lines.append("```python")
    lines.append(str(sig))
    lines.append("```")
    lines.append("")
    lines.append(render_docstring(func))
    return "\n".join(lines)


def render_class(cls: griffe.Class) -> str:
    lines: list[str] = []
    lines.append(f"## `{cls.name}`")
    lines.append("")
    lines.append(render_docstring(cls))

    for member in cls.members.values():
        if member.is_alias or member.name.startswith("_"):
            continue
        if isinstance(member, griffe.Function):
            lines.append(render_function(member))

    return "\n".join(lines)


def render_module(module_path: str, title: str) -> str:
    loader = griffe.GriffeLoader(search_paths=[str(SRC_DIR)])
    module = loader.load(module_path)

    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"`{module_path}`")
    lines.append("")
    lines.append(render_docstring(module))

    for member in module.members.values():
        if member.is_alias or member.name.startswith("_"):
            continue
        if isinstance(member, griffe.Class):
            lines.append(render_class(member))
        elif isinstance(member, griffe.Function):
            lines.append(render_function(member))

    return "\n".join(lines)


def generate_docs() -> None:
    for subdir, modules in MODULES.items():
        out_dir = DOCS_DIR / subdir
        out_dir.mkdir(parents=True, exist_ok=True)
        for module_path, title in modules:
            content = render_module(module_path, title)
            dest = out_dir / module_filename(module_path)
            dest.write_text(content)
            print(f"  {dest.relative_to(REPO_ROOT)}")

    for module_path, title, filename in TOP_LEVEL_MODULES:
        content = render_module(module_path, title)
        dest = DOCS_DIR / filename
        existing = dest.read_text() if dest.exists() else ""
        if existing.strip().startswith("---"):
            frontmatter_end = existing.index("---", 3) + 3
            frontmatter = existing[:frontmatter_end] + "\n\n"
        else:
            frontmatter = ""
        dest.write_text(frontmatter + content)
        print(f"  {dest.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    print("Generating API docs...")
    generate_docs()
    print("Done.")
