from __future__ import annotations

import logging
from pathlib import Path

from app import config

log = logging.getLogger(__name__)

_personas: list[dict] | None = None


def _parse_agent_file(path: Path) -> dict | None:
    try:
        content = path.read_text()
    except OSError:
        return None

    name = path.stem.replace("-", " ").title()
    scope = ""

    lines = content.split("\n")
    for line in lines:
        if line.startswith("# "):
            name = line[2:].strip()
            break

    for i, line in enumerate(lines):
        if line.strip().startswith("You are"):
            scope = line.strip()
            break

    return {
        "name": name,
        "file": path.name,
        "scope": scope,
        "content": content,
    }


def load_personas() -> list[dict]:
    global _personas
    if _personas is not None:
        return _personas

    agents_dir = config.CODEBASE_ROOT / ".cursor" / "agents"
    if not agents_dir.exists():
        log.warning("Agents directory not found: %s", agents_dir)
        _personas = []
        return _personas

    _personas = []
    for path in sorted(agents_dir.glob("*.md")):
        persona = _parse_agent_file(path)
        if persona:
            _personas.append(persona)

    log.info("Loaded %d personas from %s", len(_personas), agents_dir)
    return _personas


def build_team_directory() -> str:
    personas = load_personas()
    if not personas:
        return "No agent personas available."

    lines = ["## DGX Lab Agent Team\n"]
    for p in personas:
        lines.append(f"- **{p['name']}** (`{p['file']}`): {p['scope']}")

    return "\n".join(lines)
