---
sidebar_position: 2
---

# Setup

## Prerequisites

- NVIDIA DGX Spark (or any machine with an NVIDIA GPU)
- Python 3.12+ with [uv](https://docs.astral.sh/uv/)
- [Bun](https://bun.sh/) 1.3+
- Docker and Docker Compose (for production deployment)

## Development

### Install dependencies

```bash
# Backend
cd backend
uv sync

# Frontend
cd frontend
bun install
```

### Run locally

From the project root:

```bash
make dev
```

This starts both the backend (port 8000) and frontend (port 3000). The frontend proxies `/api/*` requests to the backend automatically.

### Access the app

Open `http://localhost:3000` in a browser on the DGX Spark.

## Production (Docker)

### Build and start

```bash
make build
make up
```

nginx serves the app on port 80, proxying to the frontend and backend containers.

### Stop

```bash
make down
```

### Rebuild after code changes

```bash
make rebuild
```

### View logs

```bash
make logs
```
