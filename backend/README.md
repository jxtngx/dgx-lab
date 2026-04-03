# DGX Lab — Backend

FastAPI backend serving the DGX Lab dashboard.

## Structure

```
app/
├── main.py        Application entry point, CORS, router registration
├── config.py      Environment-driven paths and hardware constants
└── routers/
    ├── control.py       Model cache management and HF Hub search
    ├── datasets.py      Local and HF dataset browsing, preview, PyArrow query
    ├── designer.py      Data-designer generation jobs
    ├── curator.py       NeMo Curator pipeline execution
    ├── automodel.py     NeMo AutoModel training jobs
    ├── logger.py        Experiment and training run metrics
    ├── traces.py        Trace, session, eval, and cost inspection
    ├── monitor.py       GPU and system telemetry via nvidia-smi
    ├── agents.py        Cursor agent transcript viewer
    └── claude_agents.py Claude Code transcript viewer
```

## Quick start

```bash
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API is available at `http://localhost:8000`. Interactive docs at `/docs`.

## Configuration

All paths and hardware constants are configured via environment variables with sensible defaults. See `.env.example` for the full list.
