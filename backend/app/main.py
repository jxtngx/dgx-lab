import os
import pwd

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import agents, automodel, claude_agents, control, curator, datasets, designer, logger, monitor, traces

app = FastAPI(title="DGX Lab", version="0.1.0")

# Wide-open CORS is intentional. DGX Lab is self-hosted and local-only
# (Mac browser → DGX Spark on the same LAN or Tailscale network).
# There is no public-facing deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(control.router, prefix="/api/control", tags=["control"])
app.include_router(logger.router, prefix="/api/logger", tags=["logger"])
app.include_router(traces.router, prefix="/api/traces", tags=["traces"])
app.include_router(monitor.router, prefix="/api/monitor", tags=["monitor"])
app.include_router(designer.router, prefix="/api/designer", tags=["designer"])
app.include_router(curator.router, prefix="/api/curator", tags=["curator"])
app.include_router(automodel.router, prefix="/api/automodel", tags=["automodel"])
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(claude_agents.router, prefix="/api/claude-agents", tags=["claude-agents"])


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/user")
def get_user():
    username = os.getlogin()
    try:
        gecos = pwd.getpwnam(username).pw_gecos
        name = gecos.split(",")[0] if gecos else username
    except KeyError:
        name = username
    return {"name": name, "username": username}
