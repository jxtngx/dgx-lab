import os
from pathlib import Path

MODELS_DIR = Path(os.getenv("DGX_LAB_MODELS_DIR", str(Path.home() / ".cache" / "huggingface" / "hub")))
EXPERIMENTS_DIR = Path(os.getenv("DGX_LAB_EXPERIMENTS_DIR", str(Path.home() / ".dgx-lab" / "experiments")))
TRACES_DIR = Path(os.getenv("DGX_LAB_TRACES_DIR", str(Path.home() / ".dgx-lab" / "traces")))
DESIGNER_DIR = Path(os.getenv("DGX_LAB_DESIGNER_DIR", str(Path.home() / ".dgx-lab" / "designer")))
DESIGNER_CONFIG_DIR = Path(os.getenv("DATA_DESIGNER_HOME", str(Path.home() / ".data-designer")))
CURATOR_DIR = Path(os.getenv("DGX_LAB_CURATOR_DIR", str(Path.home() / ".dgx-lab" / "curator")))
DATASETS_DIR = Path(os.getenv("DGX_LAB_DATASETS_DIR", str(Path.home() / ".dgx-lab" / "datasets")))
# Resolve the repo root from this file's location so it doesn't depend on
# whichever cwd happened to launch uvicorn (Make does `cd backend &&`, Docker
# uses /app, etc.). config.py lives at backend/app/config.py, so parents[2]
# is the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CURSOR_PROJECT_SLUG = str(_REPO_ROOT).replace("/", "-").lstrip("-")

CURSOR_PROJECTS_ROOT = Path(os.getenv(
    "DGX_LAB_CURSOR_PROJECTS_ROOT",
    str(Path.home() / ".cursor" / "projects"),
))

# Explicit override: when set, the agents router pins to this directory and
# the project picker is disabled. Left unset by default so the picker can
# enumerate everything under CURSOR_PROJECTS_ROOT.
AGENT_TRANSCRIPTS_DIR_OVERRIDE = os.getenv("DGX_LAB_AGENT_TRANSCRIPTS_DIR")
AGENT_TRANSCRIPTS_DIR = (
    Path(AGENT_TRANSCRIPTS_DIR_OVERRIDE)
    if AGENT_TRANSCRIPTS_DIR_OVERRIDE
    else CURSOR_PROJECTS_ROOT / DEFAULT_CURSOR_PROJECT_SLUG / "agent-transcripts"
)
CURSOR_CHATS_ROOT = Path(os.getenv(
    "DGX_LAB_CURSOR_CHATS_ROOT",
    str(Path.home() / ".cursor" / "chats"),
))
CURSOR_AI_TRACKING_DB = Path(os.getenv(
    "DGX_LAB_CURSOR_AI_TRACKING_DB",
    str(Path.home() / ".cursor" / "ai-tracking" / "ai-code-tracking.db"),
))

CLAUDE_TRANSCRIPTS_DIR = Path(os.getenv(
    "DGX_LAB_CLAUDE_TRANSCRIPTS_DIR",
    str(Path.home() / ".claude" / "projects"),
))

LANGSMITH_TRACES_DIR = Path(os.getenv(
    "DGX_LAB_LANGSMITH_TRACES_DIR",
    str(Path.home() / ".dgx-lab" / "langsmith-traces"),
))
AGENT_INDEX_DIR = Path(os.getenv(
    "DGX_LAB_AGENT_INDEX_DIR",
    str(Path.home() / ".dgx-lab" / "agent"),
))
CODEBASE_ROOT = Path(os.getenv("DGX_LAB_CODEBASE_ROOT", str(Path.cwd())))

MEMORY_TOTAL_GB = float(os.getenv("DGX_LAB_MEMORY_TOTAL_GB", "128"))
MEMORY_BANDWIDTH_MAX_GBS = float(os.getenv("DGX_LAB_MEMORY_BW_MAX_GBS", "273"))