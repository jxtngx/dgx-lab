from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app import config

router = APIRouter()
log = logging.getLogger(__name__)

_LANGSMITH_AVAILABLE: bool | None = None


def _get_client():
    global _LANGSMITH_AVAILABLE
    if _LANGSMITH_AVAILABLE is False:
        return None
    try:
        from langsmith import Client

        client = Client()
        _LANGSMITH_AVAILABLE = True
        return client
    except Exception:
        _LANGSMITH_AVAILABLE = False
        return None


def _read_local_jsonl(pattern: str = "*.jsonl") -> list[dict]:
    base = config.LANGSMITH_TRACES_DIR
    if not base.exists():
        return []
    rows: list[dict] = []
    for path in base.rglob(pattern):
        try:
            for line in path.read_text().strip().split("\n"):
                if not line.strip():
                    continue
                rows.append(json.loads(line))
        except (json.JSONDecodeError, OSError):
            continue
    return rows


def _run_to_dict(run) -> dict:
    start_ms = 0
    duration_ms = 0
    if run.start_time:
        start_ms = int(run.start_time.timestamp() * 1000)
    if run.end_time and run.start_time:
        duration_ms = int((run.end_time - run.start_time).total_seconds() * 1000)

    total_tokens = (run.total_tokens or 0) if hasattr(run, "total_tokens") else 0
    prompt_tokens = (run.prompt_tokens or 0) if hasattr(run, "prompt_tokens") else 0
    completion_tokens = (run.completion_tokens or 0) if hasattr(run, "completion_tokens") else 0
    total_cost = (run.total_cost or 0) if hasattr(run, "total_cost") else 0

    return {
        "id": str(run.id),
        "name": run.name or "unknown",
        "run_type": run.run_type,
        "start_time_ms": start_ms,
        "duration_ms": duration_ms,
        "duration_s": round(duration_ms / 1000, 2),
        "tokens": total_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost": round(total_cost, 6) if total_cost else None,
        "status": run.status,
        "has_error": run.status == "error",
        "session_id": str(run.session_id) if run.session_id else None,
        "parent_run_id": str(run.parent_run_id) if run.parent_run_id else None,
    }


@router.get("/status")
async def langsmith_status():
    client = _get_client()
    api_key_set = bool(os.getenv("LANGSMITH_API_KEY"))
    local_dir = config.LANGSMITH_TRACES_DIR
    local_files = list(local_dir.rglob("*.jsonl")) if local_dir.exists() else []

    if client:
        return {
            "mode": "api",
            "api_reachable": True,
            "api_key_set": api_key_set,
            "local_fallback_available": len(local_files) > 0,
            "local_file_count": len(local_files),
        }

    return {
        "mode": "local" if local_files else "unavailable",
        "api_reachable": False,
        "api_key_set": api_key_set,
        "local_fallback_available": len(local_files) > 0,
        "local_file_count": len(local_files),
    }


@router.get("")
async def list_runs(limit: int = Query(50, le=200), project: str | None = None):
    client = _get_client()

    if client:
        try:
            kwargs: dict = {"limit": limit}
            if project:
                kwargs["project_name"] = project
            runs = list(client.list_runs(**kwargs))
            results = [_run_to_dict(r) for r in runs]
            total_cost = sum(r.get("cost", 0) or 0 for r in results)
            return {
                "runs": results,
                "source": "api",
                "summary": {
                    "count": len(results),
                    "total_cost": round(total_cost, 4),
                },
            }
        except Exception as exc:
            log.warning("LangSmith API error, falling back to local: %s", exc)

    rows = _read_local_jsonl()
    rows.sort(key=lambda r: r.get("start_time_ms", 0), reverse=True)
    total_cost = sum(r.get("cost", 0) or 0 for r in rows)
    return {
        "runs": rows[:limit],
        "source": "local",
        "summary": {
            "count": len(rows),
            "total_cost": round(total_cost, 4),
        },
    }


@router.get("/sessions")
async def list_sessions():
    client = _get_client()

    if client:
        try:
            projects = list(client.list_projects())
            results = []
            for p in projects:
                created_ms = int(p.created_at.timestamp() * 1000) if p.created_at else 0
                results.append({
                    "id": str(p.id),
                    "name": p.name,
                    "description": p.description,
                    "created_at_ms": created_ms,
                    "run_count": p.run_count if hasattr(p, "run_count") else None,
                })
            return {"sessions": results, "source": "api"}
        except Exception as exc:
            log.warning("LangSmith sessions API error: %s", exc)

    return {"sessions": [], "source": "unavailable"}


@router.get("/feedback")
async def list_feedback(run_id: str | None = None, limit: int = Query(50, le=200)):
    client = _get_client()

    if client:
        try:
            kwargs: dict = {"limit": limit}
            if run_id:
                kwargs["run_ids"] = [run_id]
            feedbacks = list(client.list_feedback(**kwargs))
            results = []
            for fb in feedbacks:
                created_ms = int(fb.created_at.timestamp() * 1000) if fb.created_at else 0
                results.append({
                    "id": str(fb.id),
                    "run_id": str(fb.run_id) if fb.run_id else None,
                    "key": fb.key,
                    "score": fb.score,
                    "value": fb.value,
                    "comment": fb.comment,
                    "created_at_ms": created_ms,
                })
            return {"feedback": results, "source": "api"}
        except Exception as exc:
            log.warning("LangSmith feedback API error: %s", exc)

    return {"feedback": [], "source": "unavailable"}


@router.get("/{run_id}")
async def get_run(run_id: str):
    client = _get_client()

    if client:
        try:
            run = client.read_run(run_id)
            result = _run_to_dict(run)
            result["inputs"] = run.inputs
            result["outputs"] = run.outputs
            result["error"] = run.error

            child_runs = list(client.list_runs(
                trace_id=run.trace_id,
                limit=100,
            ))
            spans = []
            for child in child_runs:
                span = _run_to_dict(child)
                span["inputs"] = child.inputs
                span["outputs"] = child.outputs
                span["error"] = child.error
                spans.append(span)

            spans.sort(key=lambda s: s.get("start_time_ms", 0))
            result["spans"] = spans
            result["span_count"] = len(spans)
            return result
        except Exception as exc:
            log.warning("LangSmith run detail API error: %s", exc)

    rows = _read_local_jsonl()
    matching = [r for r in rows if r.get("id") == run_id or r.get("run_id") == run_id]
    if not matching:
        raise HTTPException(status_code=404, detail="Run not found")

    root = matching[0]
    trace_id = root.get("trace_id", run_id)
    spans = [r for r in rows if r.get("trace_id") == trace_id]
    spans.sort(key=lambda s: s.get("start_time_ms", 0))
    root["spans"] = spans
    root["span_count"] = len(spans)
    return root
