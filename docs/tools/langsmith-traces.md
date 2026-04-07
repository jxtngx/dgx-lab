# LangSmith Traces

The LangSmith Traces tool provides observability into LangChain and LangSmith-traced runs, sessions, and feedback directly inside DGX Lab. It works in two modes: live against the LangSmith API, or offline against locally exported JSONL trace files.

## Data sources

| Mode | Indicator | Requires | Reads from |
|------|-----------|----------|------------|
| **API** | Cyan dot | `LANGSMITH_API_KEY` set and API reachable | LangSmith cloud |
| **Local** | Amber dot | JSONL files present | `~/.dgx-lab/langsmith-traces/*.jsonl` |
| **Unavailable** | Red dot | Neither condition met | Nothing |

The backend tries API first, falls back to local JSONL, and reports the active mode in every response. No configuration is needed beyond the environment variable.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LANGSMITH_API_KEY` | (none) | Authenticates with the LangSmith API |
| `DGX_LAB_LANGSMITH_TRACES_DIR` | `~/.dgx-lab/langsmith-traces` | Directory for local JSONL trace exports |

## Enabling the tool

LangSmith Traces is an optional tool, disabled by default. Toggle it on from **Settings** in the sidebar.

## Layout

The Runs view uses a three-panel layout:

1. **Run list** (left, 280px) -- root-level runs sorted by time, showing name, type, duration, token count, and cost.
2. **Span waterfall** (center) -- horizontal bar chart of all spans within the selected run. Bars are color-coded: purple for LLM, blue for tool, cyan for retriever, red for errors.
3. **Span detail** (right, 320px) -- inputs, outputs, tokens, cost, and error for the selected span.

Two additional tabs sit alongside Runs:

- **Sessions** -- lists LangSmith projects (sessions) with run counts.
- **Feedback** -- shows evaluation feedback with score, key, and comment. Scores are color-coded: cyan >= 0.7, amber >= 0.4, red below 0.4.

## Backend API

All endpoints are under `/api/langsmith`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/langsmith/status` | Connection mode, API reachability, local file count |
| `GET` | `/api/langsmith` | List runs. Query params: `limit` (max 200), `project` |
| `GET` | `/api/langsmith/sessions` | List LangSmith projects |
| `GET` | `/api/langsmith/feedback` | List feedback. Query params: `run_id`, `limit` (max 200) |
| `GET` | `/api/langsmith/{run_id}` | Run detail with full span tree, inputs/outputs, errors |

### Response shape (runs)

```json
{
  "runs": [
    {
      "id": "...",
      "name": "dgx-lab-agent",
      "run_type": "chain",
      "start_time_ms": 1712000000000,
      "duration_ms": 3200,
      "duration_s": 3.2,
      "tokens": 1450,
      "prompt_tokens": 800,
      "completion_tokens": 650,
      "cost": 0.0012,
      "status": "success",
      "has_error": false,
      "session_id": "...",
      "parent_run_id": null
    }
  ],
  "source": "api",
  "summary": { "count": 50, "total_cost": 0.0340 }
}
```

## Local trace format

The agent automatically exports every invocation to `~/.dgx-lab/langsmith-traces/traces.jsonl`. Each line is a JSON object with the same fields as the API response (id, trace_id, name, run_type, start_time_ms, duration_ms, tokens, cost, status, inputs, outputs, error). This file is the fallback data source when `LANGSMITH_API_KEY` is not set.

## Source files

| Layer | Path |
|-------|------|
| Backend router | `backend/app/routers/langsmith_traces.py` |
| Config paths | `backend/app/config.py` |
| Trace exporter | `backend/app/agent/tracing.py` |
| Frontend page | `frontend/apps/web/app/(tools)/langsmith/page.tsx` |
| Sidebar entry | `frontend/apps/web/components/app-sidebar.tsx` |
| Settings default | `frontend/apps/web/lib/settings-context.tsx` |
