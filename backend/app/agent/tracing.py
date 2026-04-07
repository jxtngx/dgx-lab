from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

from app import config

log = logging.getLogger(__name__)


def configure_tracing():
    api_key = os.getenv("LANGSMITH_API_KEY")
    if api_key:
        os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
        os.environ.setdefault("LANGCHAIN_PROJECT", "dgx-lab-agent")
        log.info("LangSmith tracing enabled for project 'dgx-lab-agent'")
    else:
        os.environ["LANGCHAIN_TRACING_V2"] = "false"
        log.info("LangSmith tracing disabled (no LANGSMITH_API_KEY)")


def export_trace_locally(
    trace_id: str,
    run_name: str,
    inputs: dict,
    outputs: dict,
    duration_ms: int,
    tokens: int = 0,
    cost: float = 0.0,
    status: str = "success",
    error: str | None = None,
):
    trace_dir = config.LANGSMITH_TRACES_DIR
    trace_dir.mkdir(parents=True, exist_ok=True)

    record = {
        "id": trace_id,
        "trace_id": trace_id,
        "name": run_name,
        "run_type": "chain",
        "start_time_ms": int(time.time() * 1000) - duration_ms,
        "duration_ms": duration_ms,
        "duration_s": round(duration_ms / 1000, 2),
        "tokens": tokens,
        "cost": round(cost, 6) if cost else None,
        "status": status,
        "has_error": status == "error",
        "inputs": inputs,
        "outputs": outputs,
        "error": error,
    }

    trace_file = trace_dir / "traces.jsonl"
    try:
        with open(trace_file, "a") as f:
            f.write(json.dumps(record) + "\n")
    except OSError as exc:
        log.warning("Failed to export trace locally: %s", exc)
