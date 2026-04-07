from __future__ import annotations

import logging
from pathlib import Path

from app import config

log = logging.getLogger(__name__)

_skills: list[dict] | None = None


def load_skills() -> list[dict]:
    global _skills
    if _skills is not None:
        return _skills

    skills_dir = config.CODEBASE_ROOT / ".cursor" / "skills"
    if not skills_dir.exists():
        log.warning("Skills directory not found: %s", skills_dir)
        _skills = []
        return _skills

    _skills = []
    for skill_dir in sorted(skills_dir.iterdir()):
        if not skill_dir.is_dir():
            continue
        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            continue
        try:
            content = skill_file.read_text()
            name = skill_dir.name.replace("-", " ").title()

            for line in content.split("\n"):
                if line.startswith("# "):
                    name = line[2:].strip()
                    break

            _skills.append({
                "name": name,
                "directory": skill_dir.name,
                "content": content,
            })
        except OSError:
            continue

    log.info("Loaded %d skills from %s", len(_skills), skills_dir)
    return _skills


def build_skills_summary() -> str:
    skills = load_skills()
    if not skills:
        return "No skills available."

    lines = ["## Available Skills\n"]
    for s in skills:
        lines.append(f"- **{s['name']}** (`.cursor/skills/{s['directory']}/SKILL.md`)")

    return "\n".join(lines)
