.PHONY: dev up down build logs rebuild release push

REGISTRY := ghcr.io/jxtngx/dgx-lab
VERSION  ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

dev:
	@trap 'kill -INT 0' EXIT; \
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 2>&1 | sed -u 's/^/[api] /' & \
	cd frontend && bun run dev 2>&1 | sed -u 's/^/[web] /' & \
	wait

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

rebuild:
	docker compose up -d --build

release:
	podman build -t $(REGISTRY)/frontend:$(VERSION) -t $(REGISTRY)/frontend:latest ./frontend
	podman build -t $(REGISTRY)/backend:$(VERSION)  -t $(REGISTRY)/backend:latest  ./backend

push:
	podman push $(REGISTRY)/frontend:$(VERSION)
	podman push $(REGISTRY)/frontend:latest
	podman push $(REGISTRY)/backend:$(VERSION)
	podman push $(REGISTRY)/backend:latest
