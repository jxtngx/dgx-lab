from __future__ import annotations

import json
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query

from app import config

router = APIRouter()


def _read_jsonl(pattern: str) -> list[dict]:
    base = config.TRACES_DIR
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


def _parse_trace_files() -> list[dict]:
    base = config.TRACES_DIR
    if not base.exists():
        return []

    traces_by_id: dict[str, dict] = {}
    spans_by_trace: dict[str, list[dict]] = defaultdict(list)

    for jl_path in sorted(base.rglob("*.jsonl"), reverse=True):
        try:
            for line in jl_path.read_text().strip().split("\n"):
                if not line.strip():
                    continue
                span = json.loads(line)
                trace_id = span.get("trace_id")
                if not trace_id:
                    continue
                spans_by_trace[trace_id].append(span)
        except (json.JSONDecodeError, OSError):
            continue

    for trace_id, spans in spans_by_trace.items():
        spans.sort(key=lambda s: s.get("start_time_ms", s.get("start_time", 0)))
        root = spans[0]
        attrs = root.get("attributes", {})

        total_tokens = sum(s.get("attributes", {}).get("tokens", 0) or 0 for s in spans)
        total_cost = sum(s.get("attributes", {}).get("cost", 0) or 0 for s in spans)

        first_start = min(s.get("start_time_ms", s.get("start_time", 0)) for s in spans)
        last_end = max(
            (s.get("start_time_ms", s.get("start_time", 0))) + (s.get("duration_ms", s.get("duration", 0)))
            for s in spans
        )

        traces_by_id[trace_id] = {
            "id": trace_id,
            "name": root.get("name", "unknown"),
            "start_time_ms": first_start,
            "duration_ms": last_end - first_start,
            "duration_s": round((last_end - first_start) / 1000, 2),
            "tokens": total_tokens,
            "cost": round(total_cost, 6) if total_cost else None,
            "span_count": len(spans),
            "model": attrs.get("model"),
            "has_error": any(s.get("status") == "error" or s.get("error") for s in spans),
        }

    result = sorted(traces_by_id.values(), key=lambda t: t["start_time_ms"], reverse=True)
    return result


@router.get("")
async def list_traces(limit: int = Query(50, le=200)):
    traces = _parse_trace_files()
    total_cost = sum(t.get("cost", 0) or 0 for t in traces)
    return {
        "traces": traces[:limit],
        "summary": {
            "count": len(traces),
            "total_cost": round(total_cost, 4),
        },
    }


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.get("/sessions")
async def list_sessions():
    rows = _read_jsonl("sessions.jsonl")
    rows.sort(key=lambda r: r.get("started_at_ms", 0), reverse=True)
    total_cost = sum(r.get("total_cost", 0) or 0 for r in rows)
    total_tokens = sum(r.get("total_tokens", 0) or 0 for r in rows)
    return {
        "sessions": rows,
        "summary": {
            "count": len(rows),
            "total_cost": round(total_cost, 4),
            "total_tokens": total_tokens,
        },
    }


# ---------------------------------------------------------------------------
# Evals
# ---------------------------------------------------------------------------

@router.get("/evals")
async def list_evals():
    rows = _read_jsonl("evals.jsonl")
    rows.sort(key=lambda r: r.get("timestamp_ms", 0), reverse=True)

    passed = sum(1 for r in rows if r.get("passed"))
    failed = sum(1 for r in rows if not r.get("passed"))
    avg_score = round(sum(r.get("score", 0) for r in rows) / max(len(rows), 1), 3)

    metrics: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        metrics[r.get("metric", "unknown")].append(r.get("score", 0))
    metric_summary = {
        k: round(sum(v) / len(v), 3) for k, v in metrics.items()
    }

    return {
        "evals": rows,
        "summary": {
            "count": len(rows),
            "passed": passed,
            "failed": failed,
            "avg_score": avg_score,
            "by_metric": metric_summary,
        },
    }


# ---------------------------------------------------------------------------
# Costs
# ---------------------------------------------------------------------------

@router.get("/costs")
async def list_costs():
    rows = _read_jsonl("costs.jsonl")
    rows.sort(key=lambda r: r.get("timestamp_ms", 0), reverse=True)

    total_cost = sum(r.get("cost", 0) or 0 for r in rows)
    total_tokens_in = sum(r.get("tokens_in", 0) or 0 for r in rows)
    total_tokens_out = sum(r.get("tokens_out", 0) or 0 for r in rows)

    by_operation: dict[str, float] = defaultdict(float)
    by_model: dict[str, float] = defaultdict(float)
    for r in rows:
        by_operation[r.get("operation", "unknown")] += r.get("cost", 0) or 0
        by_model[r.get("model", "unknown")] += r.get("cost", 0) or 0

    return {
        "records": rows,
        "summary": {
            "total_cost": round(total_cost, 4),
            "total_tokens_in": total_tokens_in,
            "total_tokens_out": total_tokens_out,
            "total_tokens": total_tokens_in + total_tokens_out,
            "count": len(rows),
            "by_operation": {k: round(v, 4) for k, v in by_operation.items()},
            "by_model": {k: round(v, 4) for k, v in by_model.items()},
        },
    }


# ---------------------------------------------------------------------------
# Trace detail (must be last — catches any path segment)
# ---------------------------------------------------------------------------

@router.get("/{trace_id}")
async def get_trace(trace_id: str):
    base = config.TRACES_DIR
    if not base.exists():
        raise HTTPException(status_code=404, detail="Traces directory not found")

    spans: list[dict] = []
    for jl_path in sorted(base.rglob("*.jsonl"), reverse=True):
        try:
            for line in jl_path.read_text().strip().split("\n"):
                if not line.strip():
                    continue
                span = json.loads(line)
                if span.get("trace_id") == trace_id:
                    spans.append(span)
        except (json.JSONDecodeError, OSError):
            continue

    if not spans:
        raise HTTPException(status_code=404, detail="Trace not found")

    spans.sort(key=lambda s: s.get("start_time_ms", s.get("start_time", 0)))

    total_tokens = sum(s.get("attributes", {}).get("tokens", 0) or 0 for s in spans)
    total_cost = sum(s.get("attributes", {}).get("cost", 0) or 0 for s in spans)
    first_start = min(s.get("start_time_ms", s.get("start_time", 0)) for s in spans)
    last_end = max(
        s.get("start_time_ms", s.get("start_time", 0)) + s.get("duration_ms", s.get("duration", 0))
        for s in spans
    )

    root_attrs = spans[0].get("attributes", {})

    return {
        "id": trace_id,
        "name": spans[0].get("name", "unknown"),
        "duration_ms": last_end - first_start,
        "duration_s": round((last_end - first_start) / 1000, 2),
        "tokens": total_tokens,
        "cost": round(total_cost, 6) if total_cost else None,
        "span_count": len(spans),
        "model": root_attrs.get("model"),
        "spans": spans,
    }
