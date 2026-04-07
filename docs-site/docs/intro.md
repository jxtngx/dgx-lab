---
sidebar_position: 1
slug: /intro
---

# DGX Lab

DGX Lab is a local-first developer dashboard for the NVIDIA DGX Spark. It provides a browser-based interface for managing models, monitoring hardware, designing synthetic datasets, tracing agent runs, and more -- all running on your own hardware.

## What's in the box

| Tool | What it does |
|------|-------------|
| **Monitor** | Real-time GPU, CPU, and memory utilization for the DGX Spark |
| **Control** | Browse, pull, and delete Hugging Face models from the local cache |
| **AutoModel** | Estimate memory footprint and inference performance for a model before downloading |
| **Designer** | Generate synthetic datasets with NeMo Data Designer |
| **Curator** | Curate and filter datasets |
| **Datasets** | Browse local datasets |
| **Traces** | View experiment traces |
| **LangSmith** | Observe LangChain runs, spans, and feedback (API or local JSONL) |
| **Agents** | Browse Cursor agent personas and skills |
| **Agent Chat** | Codebase-aware assistant powered by RAG + Claude |

## Architecture

```
Mac browser ──► DGX Spark (LAN / Tailscale)
                 ├── Frontend  (Next.js, port 3000)
                 ├── Backend   (FastAPI, port 8000)
                 └── GPU       (128 GB unified memory)
```

The frontend proxies `/api/*` to the backend. In production, nginx sits in front and serves everything on port 80.

## Next steps

- [Setup](./setup) -- install dependencies and run locally
- [Remote Access](./remote-access) -- connect from your Mac
- [Agent](./tools/agent) -- how the embedded agent works
- [LangSmith Traces](./tools/langsmith-traces) -- observability for LangChain runs
