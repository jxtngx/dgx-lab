from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from collections import Counter

from app import config


_MODEL_KEY_RE = re.compile(
    rb'"(modelName|displayModelName|model|modelId|composerModel|requestedModel)"\s*:\s*"([^"\\]{1,80})"'
)


def _path_to_slug(path: str) -> str:
    return path.replace("/", "-").lstrip("-")


def _scan_chat_workspace_paths() -> dict[str, str]:
    root = config.CURSOR_CHATS_ROOT
    mapping: dict[str, str] = {}
    if not root.is_dir():
        return mapping

    for entry in root.iterdir():
        if not entry.is_dir():
            continue
        ws_hash = entry.name
        for agent_dir in entry.iterdir():
            store = agent_dir / "store.db"
            if not store.is_file():
                continue
            try:
                con = sqlite3.connect(f"file:{store}?mode=ro", uri=True)
                row = con.execute("SELECT value FROM meta LIMIT 1").fetchone()
                con.close()
            except sqlite3.Error:
                continue
            meta = _decode_meta(row[0]) if row else None
            if not meta:
                continue
            uri = meta.get("currentPlanUri") or ""
            if uri.startswith("file://"):
                workspace_path = uri[len("file://"):].split("/.cursor/")[0]
                if workspace_path:
                    mapping[ws_hash] = workspace_path
                    break
    return mapping


def workspace_hash_for_slug(slug: str) -> str:

    if slug == config.DEFAULT_CURSOR_PROJECT_SLUG:
        return hashlib.md5(str(config._REPO_ROOT).encode()).hexdigest()

    discovered = _scan_chat_workspace_paths()
    for ws_hash, workspace_path in discovered.items():
        if _path_to_slug(workspace_path) == slug:
            return ws_hash

    abs_path = "/" + slug.replace("-", "/")
    return hashlib.md5(abs_path.encode()).hexdigest()


def _decode_meta(blob: str | bytes) -> dict | None:
    if blob is None:
        return None
    try:
        if isinstance(blob, bytes):
            text = blob.decode("utf-8")
        else:
            text = bytes.fromhex(blob).decode("utf-8")
        return json.loads(text)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None


_ASCII_ID = frozenset(
    b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
)

# Patterns used **only** to seed which protobuf tag byte holds the model field.
# Once a tag is identified, every value sitting in that field is harvested --
# the patterns are not used to filter output, just to bootstrap discovery in
# blobs that don't carry a JSON envelope.
_MODEL_SEED_PREFIXES = (
    "claude-",
    "gpt-",
    "composer-",
    "gemini-",
    "grok-",
    "deepseek",
    "qwen",
    "llama-",
    "mistral",
    "sonnet",
    "haiku",
    "opus",
    "o1-",
    "o3-",
    "o4-",
)
_MODEL_SEED_EXACT = frozenset({"default", "auto", "fast", "composer", "o1", "o3", "o4"})


def _looks_seedable(text: str) -> bool:
    if text in _MODEL_SEED_EXACT:
        return True
    lower = text.lower()
    return any(lower.startswith(p) for p in _MODEL_SEED_PREFIXES)


def _length_prefixed_strings(data: bytes):
    """Yield ``(tag_byte, text)`` for every length-prefixed ASCII run in a
    protobuf blob. ``tag_byte`` is the byte preceding the length prefix.
    """
    n = len(data)
    i = 1
    while i < n:
        length = data[i - 1]
        if 1 <= length <= 80 and i + length <= n:
            chunk = data[i : i + length]
            if all(b in _ASCII_ID for b in chunk):
                tag = data[i - 2] if i >= 2 else None
                yield tag, chunk.decode("ascii", errors="ignore")
                i += length + 1
                continue
        i += 1


def _scan_blob_for_models(data: bytes, sink: Counter) -> None:
    if not data:
        return

    json_values: set[str] = set()
    for m in _MODEL_KEY_RE.finditer(data):
        value = m.group(2).decode("ascii", errors="ignore").strip()
        if value:
            sink[value] += 1
            json_values.add(value)

    runs = list(_length_prefixed_strings(data))
    if not runs:
        return

    model_tags: set[int] = set()
    for tag, text in runs:
        if tag is None:
            continue
        if text in json_values or _looks_seedable(text):
            model_tags.add(tag)

    if not model_tags:
        return

    for tag, text in runs:
        if tag in model_tags and text not in json_values:
            sink[text] += 1


def model_message_counts_for_store(store_path) -> Counter:

    counts: Counter = Counter()
    if not store_path.is_file():
        return counts
    try:
        con = sqlite3.connect(f"file:{store_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return counts
    try:
        for (data,) in con.execute("SELECT data FROM blobs"):
            if isinstance(data, bytes):
                _scan_blob_for_models(data, counts)
    except sqlite3.Error:
        pass
    finally:
        try:
            con.close()
        except sqlite3.Error:
            pass
    return counts


def list_chat_agents(
    workspace_hash: str,
    *,
    include_blob_models: bool = False,
) -> list[dict]:

    root = config.CURSOR_CHATS_ROOT / workspace_hash
    if not root.is_dir():
        return []

    agents: list[dict] = []
    for entry in root.iterdir():
        store = entry / "store.db"
        if not store.is_file():
            continue
        try:
            con = sqlite3.connect(f"file:{store}?mode=ro", uri=True)
            try:
                row = con.execute("SELECT value FROM meta LIMIT 1").fetchone()
            finally:
                con.close()
        except sqlite3.Error:
            continue

        meta = _decode_meta(row[0]) if row else None
        if not meta:
            continue

        agent: dict = {
            "agent_id": meta.get("agentId", entry.name),
            "name": meta.get("name"),
            "mode": meta.get("mode"),
            "last_used_model": meta.get("lastUsedModel"),
            "created_at": meta.get("createdAt"),
            "current_plan_uri": meta.get("currentPlanUri"),
        }

        if include_blob_models:
            counts = model_message_counts_for_store(store)
            total = sum(counts.values())
            primary = counts.most_common(1)[0][0] if counts else None
            agent["message_models"] = dict(counts)
            agent["message_count"] = total
            agent["primary_model"] = primary

        agents.append(agent)

    agents.sort(key=lambda a: a.get("created_at") or 0, reverse=True)
    return agents


def aggregate_message_models(workspace_hash: str) -> dict[str, int]:
    """Sum per-message model counts across every agent in a workspace."""
    totals: Counter = Counter()
    for agent in list_chat_agents(workspace_hash, include_blob_models=True):
        for model, count in (agent.get("message_models") or {}).items():
            totals[model] += count
    return dict(totals)


def _empty_model_stats() -> dict:
    return {
        "by_model": {},
        "totals": {"hashes": 0, "files": 0, "deletions": 0},
        "available": False,
    }


def model_stats_for_agents(agent_ids: list[str] | None) -> dict:

    db_path = config.CURSOR_AI_TRACKING_DB
    if not db_path.is_file():
        return _empty_model_stats()

    if agent_ids is not None and not agent_ids:
        return {**_empty_model_stats(), "available": True}

    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return _empty_model_stats()

    try:
        if agent_ids is None:
            hash_rows = con.execute(
                "SELECT model, COUNT(*) FROM ai_code_hashes GROUP BY model"
            ).fetchall()
            file_rows = con.execute(
                "SELECT model, COUNT(*) FROM tracked_file_content GROUP BY model"
            ).fetchall()
            del_rows = con.execute(
                "SELECT model, COUNT(*) FROM ai_deleted_files GROUP BY model"
            ).fetchall()
        else:
            placeholders = ",".join("?" * len(agent_ids))
            hash_rows = con.execute(
                f"SELECT model, COUNT(*) FROM ai_code_hashes WHERE conversationId IN ({placeholders}) GROUP BY model",
                agent_ids,
            ).fetchall()
            file_rows = con.execute(
                f"SELECT model, COUNT(*) FROM tracked_file_content WHERE conversationId IN ({placeholders}) GROUP BY model",
                agent_ids,
            ).fetchall()
            del_rows = con.execute(
                f"SELECT model, COUNT(*) FROM ai_deleted_files WHERE conversationId IN ({placeholders}) GROUP BY model",
                agent_ids,
            ).fetchall()
    except sqlite3.Error:
        con.close()
        return _empty_model_stats()
    finally:
        try:
            con.close()
        except sqlite3.Error:
            pass

    by_model: dict[str, dict[str, int]] = {}

    def _bump(rows: list[tuple], key: str) -> None:
        for model, count in rows:
            label = model or "unknown"
            slot = by_model.setdefault(label, {"hashes": 0, "files": 0, "deletions": 0})
            slot[key] += int(count or 0)

    _bump(hash_rows, "hashes")
    _bump(file_rows, "files")
    _bump(del_rows, "deletions")

    totals = {"hashes": 0, "files": 0, "deletions": 0}
    for slot in by_model.values():
        for k, v in slot.items():
            totals[k] = totals.get(k, 0) + v

    return {
        "by_model": by_model,
        "totals": totals,
        "available": True,
    }


def conversation_extension_breakdown(agent_id: str) -> list[tuple[str, int]]:
    """File-extension distribution for a single agent's generated hashes."""
    db_path = config.CURSOR_AI_TRACKING_DB
    if not db_path.is_file():
        return []
    try:
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    except sqlite3.Error:
        return []
    try:
        rows = con.execute(
            "SELECT COALESCE(fileExtension, ''), COUNT(*) FROM ai_code_hashes "
            "WHERE conversationId = ? GROUP BY fileExtension ORDER BY COUNT(*) DESC",
            (agent_id,),
        ).fetchall()
    except sqlite3.Error:
        return []
    finally:
        try:
            con.close()
        except sqlite3.Error:
            pass
    return [(ext or "(none)", int(count)) for ext, count in rows]
