from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app import config, cursor_chats

router = APIRouter()


def _resolve_project_dir(project: str | None) -> Path:
    if config.AGENT_TRANSCRIPTS_DIR_OVERRIDE:
        return Path(config.AGENT_TRANSCRIPTS_DIR_OVERRIDE)

    root = config.CURSOR_PROJECTS_ROOT
    if project:
        return root / project / "agent-transcripts"

    default = root / config.DEFAULT_CURSOR_PROJECT_SLUG / "agent-transcripts"
    if default.is_dir():
        return default

    if root.is_dir():
        candidates: list[tuple[float, Path]] = []
        for entry in root.iterdir():
            sub = entry / "agent-transcripts"
            if sub.is_dir():
                try:
                    candidates.append((sub.stat().st_mtime, sub))
                except OSError:
                    continue
        if candidates:
            candidates.sort(key=lambda t: t[0], reverse=True)
            return candidates[0][1]

    return default


def _transcript_path(base: Path, conversation_id: str) -> Path:
    return base / conversation_id / f"{conversation_id}.jsonl"


def _parse_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    lines: list[dict] = []
    try:
        for line in path.read_text().strip().split("\n"):
            if not line.strip():
                continue
            lines.append(json.loads(line))
    except (json.JSONDecodeError, OSError):
        pass
    return lines


def _extract_text(content: list | str | None) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return ""


def _extract_tool_calls(content: list | str | None) -> list[dict]:
    if not isinstance(content, list):
        return []
    calls: list[dict] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            calls.append({"name": block.get("name", ""), "input": block.get("input", {})})
    return calls


def _first_user_message(turns: list[dict]) -> str:
    for turn in turns:
        if turn.get("role") == "user":
            content = turn.get("message", {}).get("content") if isinstance(turn.get("message"), dict) else turn.get("content")
            text = _extract_text(content)
            if text.strip():
                return text.strip()[:120]
    return "Untitled conversation"


def _subagent_dir(base: Path, conversation_id: str) -> Path:
    return base / conversation_id / "subagents"


def _slug_to_display_path(slug: str) -> str:
    return "/" + slug.replace("-", "/")


def _count_conversations(transcripts_dir: Path) -> int:
    if not transcripts_dir.is_dir():
        return 0
    count = 0
    for entry in transcripts_dir.iterdir():
        if not entry.is_dir():
            continue
        if (entry / f"{entry.name}.jsonl").exists():
            count += 1
    return count


@router.get("/projects")
async def list_projects():
    if config.AGENT_TRANSCRIPTS_DIR_OVERRIDE:
        return {"projects": [], "default_slug": None, "override": True}

    root = config.CURSOR_PROJECTS_ROOT
    if not root.is_dir():
        return {"projects": [], "default_slug": config.DEFAULT_CURSOR_PROJECT_SLUG, "override": False}

    projects: list[dict] = []
    for entry in root.iterdir():
        if not entry.is_dir():
            continue
        transcripts = entry / "agent-transcripts"
        if not transcripts.is_dir():
            continue
        try:
            mtime = transcripts.stat().st_mtime
        except OSError:
            continue
        projects.append({
            "slug": entry.name,
            "display_path": _slug_to_display_path(entry.name),
            "conversation_count": _count_conversations(transcripts),
            "modified_at": mtime,
            "is_default": entry.name == config.DEFAULT_CURSOR_PROJECT_SLUG,
        })

    projects.sort(key=lambda p: p["modified_at"], reverse=True)
    return {
        "projects": projects,
        "default_slug": config.DEFAULT_CURSOR_PROJECT_SLUG,
        "override": False,
    }


@router.get("/conversations")
async def list_conversations(project: str | None = Query(None)):
    base = _resolve_project_dir(project)
    if not base.exists():
        return {"conversations": []}

    conversations: list[dict] = []
    for entry in sorted(base.iterdir(), reverse=True):
        if not entry.is_dir():
            continue
        jsonl = entry / f"{entry.name}.jsonl"
        if not jsonl.exists():
            continue

        turns = _parse_jsonl(jsonl)
        if not turns:
            continue

        tool_call_count = 0
        for turn in turns:
            content = turn.get("message", {}).get("content") if isinstance(turn.get("message"), dict) else turn.get("content")
            tool_call_count += len(_extract_tool_calls(content))

        sub_dir = entry / "subagents"
        subagent_count = len(list(sub_dir.glob("*.jsonl"))) if sub_dir.exists() else 0

        stat = jsonl.stat()
        conversations.append({
            "id": entry.name,
            "title": _first_user_message(turns),
            "message_count": len(turns),
            "tool_call_count": tool_call_count,
            "subagent_count": subagent_count,
            "size_bytes": stat.st_size,
            "modified_at": stat.st_mtime,
        })

    conversations.sort(key=lambda c: c["modified_at"], reverse=True)
    return {"conversations": conversations}


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, project: str | None = Query(None)):
    base = _resolve_project_dir(project)
    path = _transcript_path(base, conversation_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Conversation not found")

    raw_turns = _parse_jsonl(path)
    if not raw_turns:
        raise HTTPException(status_code=404, detail="Conversation is empty")

    stat = path.stat()
    total_turns = len(raw_turns)

    turns: list[dict] = []
    for i, turn in enumerate(raw_turns):
        role = turn.get("role", "unknown")
        content = turn.get("message", {}).get("content") if isinstance(turn.get("message"), dict) else turn.get("content")
        text = _extract_text(content)
        tool_calls = _extract_tool_calls(content)

        approx_ts = stat.st_mtime - (total_turns - 1 - i) * 0.001

        turns.append({
            "index": i,
            "role": role,
            "text": text,
            "tool_calls": tool_calls,
            "timestamp_approx": approx_ts,
        })

    return {"conversation_id": conversation_id, "turns": turns}


@router.get("/conversations/{conversation_id}/subagents")
async def list_subagents(conversation_id: str, project: str | None = Query(None)):
    base = _resolve_project_dir(project)
    sub_dir = _subagent_dir(base, conversation_id)
    if not sub_dir.exists():
        return {"subagents": []}

    subagents: list[dict] = []
    for jsonl in sorted(sub_dir.glob("*.jsonl"), reverse=True):
        turns = _parse_jsonl(jsonl)
        subagents.append({
            "id": jsonl.stem,
            "title": _first_user_message(turns),
            "message_count": len(turns),
            "size_bytes": jsonl.stat().st_size,
        })

    return {"subagents": subagents}


@router.get("/conversations/{conversation_id}/subagents/{subagent_id}")
async def get_subagent(conversation_id: str, subagent_id: str, project: str | None = Query(None)):
    base = _resolve_project_dir(project)
    sub_dir = _subagent_dir(base, conversation_id)
    path = sub_dir / f"{subagent_id}.jsonl"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Subagent transcript not found")

    raw_turns = _parse_jsonl(path)
    turns: list[dict] = []
    for i, turn in enumerate(raw_turns):
        role = turn.get("role", "unknown")
        content = turn.get("message", {}).get("content") if isinstance(turn.get("message"), dict) else turn.get("content")
        turns.append({
            "index": i,
            "role": role,
            "text": _extract_text(content),
            "tool_calls": _extract_tool_calls(content),
        })

    return {"subagent_id": subagent_id, "turns": turns}


@router.get("/model-usage")
async def model_usage(
    project: str | None = Query(None),
    conversation_id: str | None = Query(None),
):
    """Aggregate Cursor model usage for a project (or a single conversation).

    Joins two Cursor stores that live outside the agent-transcripts directory:
    ``~/.cursor/chats/<workspace_hash>/<agent_id>/store.db`` for per-agent
    metadata, and ``~/.cursor/ai-tracking/ai-code-tracking.db`` for code-hash
    aggregates. The workspace hash is derived from the project slug
    (md5 of the absolute repo path), so this only resolves when a project is
    selected; when ``DGX_LAB_AGENT_TRANSCRIPTS_DIR`` is overridden we still
    return global tracking totals so the UI has something to show.
    """
    if config.AGENT_TRANSCRIPTS_DIR_OVERRIDE and not project:
        global_stats = cursor_chats.model_stats_for_agents(None)
        return {
            "scope": "global",
            "workspace_hash": None,
            "agents": [],
            "agent_match": None,
            **global_stats,
        }

    project_slug = project or config.DEFAULT_CURSOR_PROJECT_SLUG
    workspace_hash = cursor_chats.workspace_hash_for_slug(project_slug)
    agents = cursor_chats.list_chat_agents(workspace_hash, include_blob_models=True)
    agent_ids = [a["agent_id"] for a in agents if a.get("agent_id")]

    by_model_messages: dict[str, int] = {}
    for a in agents:
        for model, count in (a.get("message_models") or {}).items():
            by_model_messages[model] = by_model_messages.get(model, 0) + count
    total_messages = sum(by_model_messages.values())

    if conversation_id:
        # Per-conversation drill-down. Only useful when the agent-transcript UUID
        # actually matches a chats agentId (older transcripts won't match).
        match = next((a for a in agents if a.get("agent_id") == conversation_id), None)
        per_agent = cursor_chats.model_stats_for_agents([conversation_id])
        agent_message_models = match.get("message_models") if match else {}
        return {
            "scope": "conversation",
            "workspace_hash": workspace_hash,
            "agents": agents,
            "agent_match": match,
            "extension_breakdown": cursor_chats.conversation_extension_breakdown(conversation_id),
            "by_model_messages": agent_message_models or {},
            "total_messages": sum((agent_message_models or {}).values()),
            **per_agent,
        }

    project_stats = cursor_chats.model_stats_for_agents(agent_ids)
    return {
        "scope": "project",
        "workspace_hash": workspace_hash,
        "agents": agents,
        "agent_match": None,
        "by_model_messages": by_model_messages,
        "total_messages": total_messages,
        **project_stats,
    }


@router.get("/stats")
async def get_stats(project: str | None = Query(None)):
    base = _resolve_project_dir(project)
    if not base.exists():
        return {
            "total_conversations": 0,
            "total_messages": 0,
            "total_tool_calls": 0,
            "tool_frequency": {},
        }

    total_conversations = 0
    total_messages = 0
    tool_counter: Counter[str] = Counter()

    for entry in base.iterdir():
        if not entry.is_dir():
            continue
        jsonl = entry / f"{entry.name}.jsonl"
        if not jsonl.exists():
            continue

        total_conversations += 1
        turns = _parse_jsonl(jsonl)
        total_messages += len(turns)

        for turn in turns:
            content = turn.get("message", {}).get("content") if isinstance(turn.get("message"), dict) else turn.get("content")
            for tc in _extract_tool_calls(content):
                tool_counter[tc["name"]] += 1

    return {
        "total_conversations": total_conversations,
        "total_messages": total_messages,
        "total_tool_calls": sum(tool_counter.values()),
        "tool_frequency": dict(tool_counter.most_common()),
    }
