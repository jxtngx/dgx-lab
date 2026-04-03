---
name: fork-setup
description: >-
  Get DGX Lab running on your own DGX Spark after cloning or forking.
  Covers prerequisites, install, config, first run, Docker, Tailscale,
  and common troubleshooting. Use when setting up DGX Lab for the first
  time or diagnosing setup issues.
---

# Fork Setup — Getting DGX Lab Running

## Prerequisites

| Requirement | Check |
|-------------|-------|
| NVIDIA DGX Spark (or GPU with `nvidia-smi`) | `nvidia-smi` returns GPU info |
| Python 3.12+ | `python3 --version` |
| [uv](https://docs.astral.sh/uv/) | `uv --version` |
| [Bun](https://bun.sh/) 1.3+ | `bun --version` |
| Docker + Docker Compose (production only) | `docker compose version` |

## Install and first run

```bash
git clone <your-fork-url> dgx-lab && cd dgx-lab
cd backend && uv sync && cd ..
cd frontend && bun install && cd ..
make dev
```

Open `http://localhost:3000`. Backend is at `http://localhost:8000/api/health`.

## Configuration

All paths are set via env vars in `backend/app/config.py`. Defaults work out of the box on a Spark:

| Env var | Default | What |
|---------|---------|------|
| `DGX_LAB_MODELS_DIR` | `~/.cache/huggingface/hub` | HuggingFace model cache |
| `DGX_LAB_EXPERIMENTS_DIR` | `~/.dgx-lab/experiments` | Logger experiment data |
| `DGX_LAB_TRACES_DIR` | `~/.dgx-lab/traces` | Agent trace JSONL files |
| `DGX_LAB_DATASETS_DIR` | `~/.dgx-lab/datasets` | Local dataset storage |
| `DGX_LAB_MEMORY_TOTAL_GB` | `128` | Total memory for fit calculations |
| `DGX_LAB_MEMORY_BW_MAX_GBS` | `273` | Memory bandwidth ceiling |

If your machine has different specs (e.g. a non-Spark GPU), override the memory vars:

```bash
export DGX_LAB_MEMORY_TOTAL_GB=80
export DGX_LAB_MEMORY_BW_MAX_GBS=200
```

## Docker (production)

```bash
make build
make up
```

Serves on port 80 via nginx. Stop with `make down`. Logs with `make logs`.

## Remote access (Tailscale)

```bash
# On the Spark
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale serve http://localhost:80

# From your Mac
open https://spark.your-tailnet.ts.net
```

See `docs/remote-access.md` for SSH tunnels and systemd auto-start.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `uv sync` fails | Ensure Python 3.12+. Run `uv python install 3.12` if needed. |
| `bun install` fails | Ensure Bun 1.3+. Run `curl -fsSL https://bun.sh/install \| bash` to update. |
| Monitor shows "GPU not available" | Verify `nvidia-smi` works on the host. In Docker, add `deploy.resources.reservations.devices` for GPU access. |
| Frontend can't reach backend | Dev mode proxies `/api/*` via Next.js rewrite to `localhost:8000`. Ensure backend is running. |
| Docker build fails on frontend | Ensure `bun.lock` exists. Run `bun install` locally first to generate it. |
| Port 80 already in use | Change the nginx port in `docker-compose.yaml`: `ports: ["8080:80"]` |

## Project layout (quick reference)

```
backend/app/main.py        ← FastAPI app, router registration
backend/app/config.py      ← All env vars and hardware constants
backend/app/routers/*.py   ← One router per tool
frontend/apps/web/app/     ← Next.js pages (app router)
frontend/apps/web/components/ ← UI components per tool
frontend/packages/ui/      ← Shared shadcn components
docker-compose.yaml        ← frontend + backend + nginx
nginx.conf                 ← Reverse proxy config
Makefile                   ← dev, build, up, down, logs, rebuild
```
