from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app import config

router = APIRouter()


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


def _is_turn(line: dict) -> bool:
    return line.get("type") in ("user", "assistant")


def _get_content(line: dict) -> list | str | None:
    msg = line.get("message")
    if isinstance(msg, dict):
        return msg.get("content")
    return None


def _first_user_message(lines: list[dict]) -> str:
    for line in lines:
        if line.get("type") != "user":
            continue
        text = _extract_text(_get_content(line))
        if text.strip():
            return text.strip()[:120]
    return "Untitled conversation"


def _find_all_jsonls() -> list[tuple[Path, Path]]:
    """Return (project_dir, jsonl_path) pairs across all project subdirs."""
    base = config.CLAUDE_TRANSCRIPTS_DIR
    if not base.exists():
        return []
    results: list[tuple[Path, Path]] = []
    for project_dir in base.iterdir():
        if not project_dir.is_dir():
            continue
        for jsonl in project_dir.glob("*.jsonl"):
            results.append((project_dir, jsonl))
    return results


def _find_jsonl(conversation_id: str) -> tuple[Path, Path] | None:
    """Find the (project_dir, jsonl_path) for a given conversation UUID."""
    base = config.CLAUDE_TRANSCRIPTS_DIR
    if not base.exists():
        return None
    for project_dir in base.iterdir():
        if not project_dir.is_dir():
            continue
        candidate = project_dir / f"{conversation_id}.jsonl"
        if candidate.exists():
            return (project_dir, candidate)
    return None


def _subagent_dir(project_dir: Path, conversation_id: str) -> Path:
    return project_dir / conversation_id / "subagents"


@router.get("/conversations")
async def list_conversations():
    all_jsonls = _find_all_jsonls()
    if not all_jsonls:
        return {"conversations": []}

    conversations: list[dict] = []
    for project_dir, jsonl in all_jsonls:
        lines = _parse_jsonl(jsonl)
        turn_lines = [l for l in lines if _is_turn(l)]
        if not turn_lines:
            continue

        tool_call_count = 0
        for line in turn_lines:
            tool_call_count += len(_extract_tool_calls(_get_content(line)))

        sub_dir = _subagent_dir(project_dir, jsonl.stem)
        subagent_count = len(list(sub_dir.glob("*.jsonl"))) if sub_dir.exists() else 0

        stat = jsonl.stat()
        conversations.append({
            "id": jsonl.stem,
            "title": _first_user_message(lines),
            "message_count": len(turn_lines),
            "tool_call_count": tool_call_count,
            "subagent_count": subagent_count,
            "size_bytes": stat.st_size,
            "modified_at": stat.st_mtime,
        })

    conversations.sort(key=lambda c: c["modified_at"], reverse=True)
    return {"conversations": conversations}


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    result = _find_jsonl(conversation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Conversation not found")

    _, jsonl_path = result
    all_lines = _parse_jsonl(jsonl_path)
    turn_lines = [l for l in all_lines if _is_turn(l)]
    if not turn_lines:
        raise HTTPException(status_code=404, detail="Conversation is empty")

    turns: list[dict] = []
    for i, line in enumerate(turn_lines):
        content = _get_content(line)
        ts_str = line.get("timestamp")
        ts = None
        if ts_str:
            from datetime import datetime, timezone
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp()
            except (ValueError, TypeError):
                pass

        turns.append({
            "index": i,
            "role": line.get("type", "unknown"),
            "text": _extract_text(content),
            "tool_calls": _extract_tool_calls(content),
            "timestamp_approx": ts,
        })

    return {"conversation_id": conversation_id, "turns": turns}


@router.get("/conversations/{conversation_id}/subagents")
async def list_subagents(conversation_id: str):
    result = _find_jsonl(conversation_id)
    if not result:
        return {"subagents": []}

    project_dir, _ = result
    sub_dir = _subagent_dir(project_dir, conversation_id)
    if not sub_dir.exists():
        return {"subagents": []}

    subagents: list[dict] = []
    for jsonl in sorted(sub_dir.glob("*.jsonl"), reverse=True):
        meta_path = sub_dir / f"{jsonl.stem}.meta.json"
        title = jsonl.stem
        agent_type = ""
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
                desc = meta.get("description", "")
                agent_type = meta.get("agentType", "")
                if desc:
                    title = desc
            except (json.JSONDecodeError, OSError):
                pass

        lines = _parse_jsonl(jsonl)
        turn_lines = [l for l in lines if _is_turn(l)]
        subagents.append({
            "id": jsonl.stem,
            "title": title,
            "agent_type": agent_type,
            "message_count": len(turn_lines),
            "size_bytes": jsonl.stat().st_size,
        })

    return {"subagents": subagents}


@router.get("/conversations/{conversation_id}/subagents/{subagent_id}")
async def get_subagent(conversation_id: str, subagent_id: str):
    result = _find_jsonl(conversation_id)
    if not result:
        raise HTTPException(status_code=404, detail="Conversation not found")

    project_dir, _ = result
    sub_dir = _subagent_dir(project_dir, conversation_id)
    path = sub_dir / f"{subagent_id}.jsonl"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Subagent transcript not found")

    all_lines = _parse_jsonl(path)
    turn_lines = [l for l in all_lines if _is_turn(l)]
    turns: list[dict] = []
    for i, line in enumerate(turn_lines):
        content = _get_content(line)
        turns.append({
            "index": i,
            "role": line.get("type", "unknown"),
            "text": _extract_text(content),
            "tool_calls": _extract_tool_calls(content),
        })

    return {"subagent_id": subagent_id, "turns": turns}


@router.get("/stats")
async def get_stats():
    all_jsonls = _find_all_jsonls()
    if not all_jsonls:
        return {
            "total_conversations": 0,
            "total_messages": 0,
            "total_tool_calls": 0,
            "tool_frequency": {},
        }

    total_conversations = 0
    total_messages = 0
    tool_counter: Counter[str] = Counter()

    for _, jsonl in all_jsonls:
        lines = _parse_jsonl(jsonl)
        turn_lines = [l for l in lines if _is_turn(l)]
        if not turn_lines:
            continue

        total_conversations += 1
        total_messages += len(turn_lines)

        for line in turn_lines:
            for tc in _extract_tool_calls(_get_content(line)):
                tool_counter[tc["name"]] += 1

    return {
        "total_conversations": total_conversations,
        "total_messages": total_messages,
        "total_tool_calls": sum(tool_counter.values()),
        "tool_frequency": dict(tool_counter.most_common()),
    }
