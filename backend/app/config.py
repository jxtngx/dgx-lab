import os
from pathlib import Path

MODELS_DIR = Path(os.getenv("DGX_LAB_MODELS_DIR", str(Path.home() / ".cache" / "huggingface" / "hub")))
EXPERIMENTS_DIR = Path(os.getenv("DGX_LAB_EXPERIMENTS_DIR", str(Path.home() / ".dgx-lab" / "experiments")))
TRACES_DIR = Path(os.getenv("DGX_LAB_TRACES_DIR", str(Path.home() / ".dgx-lab" / "traces")))
DESIGNER_DIR = Path(os.getenv("DGX_LAB_DESIGNER_DIR", str(Path.home() / ".dgx-lab" / "designer")))
DESIGNER_CONFIG_DIR = Path(os.getenv("DATA_DESIGNER_HOME", str(Path.home() / ".data-designer")))
CURATOR_DIR = Path(os.getenv("DGX_LAB_CURATOR_DIR", str(Path.home() / ".dgx-lab" / "curator")))
DATASETS_DIR = Path(os.getenv("DGX_LAB_DATASETS_DIR", str(Path.home() / ".dgx-lab" / "datasets")))
def _default_cursor_transcripts() -> str:
    projects = Path.home() / ".cursor" / "projects"
    if projects.is_dir():
        cwd_slug = str(Path.cwd()).replace("/", "-").lstrip("-")
        candidate = projects / cwd_slug / "agent-transcripts"
        if candidate.is_dir():
            return str(candidate)
    return str(Path.home() / ".dgx-lab" / "agent-transcripts")

AGENT_TRANSCRIPTS_DIR = Path(os.getenv(
    "DGX_LAB_AGENT_TRANSCRIPTS_DIR",
    _default_cursor_transcripts(),
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