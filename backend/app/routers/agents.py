from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app import config

router = APIRouter()


def _transcript_path(conversation_id: str) -> Path:
    return config.AGENT_TRANSCRIPTS_DIR / conversation_id / f"{conversation_id}.jsonl"


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


def _subagent_dir(conversation_id: str) -> Path:
    return config.AGENT_TRANSCRIPTS_DIR / conversation_id / "subagents"


@router.get("/conversations")
async def list_conversations():
    base = config.AGENT_TRANSCRIPTS_DIR
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
async def get_conversation(conversation_id: str):
    path = _transcript_path(conversation_id)
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
async def list_subagents(conversation_id: str):
    sub_dir = _subagent_dir(conversation_id)
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
async def get_subagent(conversation_id: str, subagent_id: str):
    sub_dir = _subagent_dir(conversation_id)
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


@router.get("/stats")
async def get_stats():
    base = config.AGENT_TRANSCRIPTS_DIR
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
