from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config

router = APIRouter()
log = logging.getLogger(__name__)

_conversations: dict[str, list[dict]] = {}
_conversations_lock = threading.Lock()

CONVERSATIONS_FILE = config.AGENT_INDEX_DIR / "conversations.json"


def _load_conversations():
    global _conversations
    if CONVERSATIONS_FILE.exists():
        try:
            _conversations = json.loads(CONVERSATIONS_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            _conversations = {}


def _save_conversations():
    CONVERSATIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        CONVERSATIONS_FILE.write_text(json.dumps(_conversations, indent=2))
    except OSError as exc:
        log.warning("Failed to save conversations: %s", exc)


_load_conversations()


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


@router.post("/chat")
async def chat(req: ChatRequest):
    from app.agent.chain import invoke

    conv_id = req.conversation_id or str(uuid.uuid4())

    with _conversations_lock:
        if conv_id not in _conversations:
            _conversations[conv_id] = []

    history_messages = []
    with _conversations_lock:
        for turn in _conversations.get(conv_id, []):
            if turn["role"] == "user":
                history_messages.append(("human", turn["content"]))
            elif turn["role"] == "assistant":
                history_messages.append(("ai", turn["content"]))

    try:
        result = invoke(
            question=req.message,
            history=history_messages,
            conversation_id=conv_id,
        )
    except Exception as exc:
        log.error("Agent invocation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Agent error: {exc}")

    now_ms = int(time.time() * 1000)
    with _conversations_lock:
        _conversations[conv_id].append({
            "role": "user",
            "content": req.message,
            "timestamp_ms": now_ms - (result.get("duration_ms", 0)),
        })
        _conversations[conv_id].append({
            "role": "assistant",
            "content": result["answer"],
            "sources": result.get("sources", []),
            "trace_id": result.get("trace_id"),
            "timestamp_ms": now_ms,
        })
        _save_conversations()

    return {
        "conversation_id": conv_id,
        "answer": result["answer"],
        "sources": result.get("sources", []),
        "trace_id": result.get("trace_id"),
        "duration_ms": result.get("duration_ms"),
    }


@router.get("/conversations")
async def list_conversations():
    with _conversations_lock:
        summaries = []
        for conv_id, turns in _conversations.items():
            if not turns:
                continue
            first_user = next((t for t in turns if t["role"] == "user"), None)
            title = (first_user["content"][:80] + "...") if first_user and len(first_user["content"]) > 80 else (first_user["content"] if first_user else "Untitled")
            summaries.append({
                "id": conv_id,
                "title": title,
                "turn_count": len(turns),
                "last_activity_ms": turns[-1].get("timestamp_ms", 0),
            })
        summaries.sort(key=lambda s: s["last_activity_ms"], reverse=True)
        return {"conversations": summaries}


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    with _conversations_lock:
        turns = _conversations.get(conversation_id)
    if turns is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"conversation_id": conversation_id, "turns": turns}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    with _conversations_lock:
        if conversation_id in _conversations:
            del _conversations[conversation_id]
            _save_conversations()
    return {"status": "ok"}


@router.post("/reindex")
async def reindex():
    from app.agent.rag import build_index

    try:
        build_index(force=True)
        return {"status": "ok", "message": "Index rebuilt"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reindex failed: {exc}")
