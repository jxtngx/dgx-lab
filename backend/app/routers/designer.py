from __future__ import annotations

import json
import subprocess
import threading
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app import config

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _check_installed() -> dict:
    try:
        result = subprocess.run(
            ["python", "-m", "data_designer", "--version"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            version = result.stdout.strip() or result.stderr.strip()
            return {"installed": True, "version": version}
    except Exception:
        pass

    try:
        import importlib.metadata
        version = importlib.metadata.version("data-designer")
        return {"installed": True, "version": version}
    except Exception:
        return {"installed": False, "version": None}


def _read_yaml(path: Path) -> dict | list | None:
    if not path.exists():
        return None
    try:
        import yaml
        return yaml.safe_load(path.read_text())
    except Exception:
        return None


def _scan_datasets() -> list[dict]:
    base = config.DESIGNER_DIR
    if not base.exists():
        return []

    datasets = []
    for f in sorted(base.rglob("*")):
        if f.is_dir() or f.name.startswith("."):
            continue
        if f.suffix not in (".jsonl", ".json", ".csv", ".parquet"):
            continue

        stat = f.stat()
        row_count = None
        if f.suffix == ".jsonl":
            try:
                row_count = sum(1 for line in f.read_text().strip().split("\n") if line.strip())
            except Exception:
                pass
        elif f.suffix == ".parquet":
            try:
                import pyarrow.parquet as pq
                row_count = pq.read_metadata(str(f)).num_rows
            except Exception:
                pass

        datasets.append({
            "name": str(f.relative_to(base)),
            "path": str(f),
            "format": f.suffix.lstrip("."),
            "size_bytes": stat.st_size,
            "modified": stat.st_mtime,
            "row_count": row_count,
        })

    return datasets


def _preview_file(path: Path, limit: int = 20) -> list[dict]:
    if path.suffix == ".jsonl":
        rows = []
        for line in path.read_text().strip().split("\n"):
            if line.strip():
                rows.append(json.loads(line))
                if len(rows) >= limit:
                    break
        return rows
    elif path.suffix == ".json":
        data = json.loads(path.read_text())
        if isinstance(data, list):
            return data[:limit]
        return [data]
    elif path.suffix == ".csv":
        import csv
        rows = []
        with open(path) as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                rows.append(dict(row))
                if len(rows) >= limit:
                    break
        return rows
    elif path.suffix == ".parquet":
        import pyarrow.parquet as pq
        table = pq.read_table(str(path))
        return table.slice(0, limit).to_pylist()
    return []


# ---------------------------------------------------------------------------
# Job tracking
# ---------------------------------------------------------------------------

_jobs: dict[str, dict] = {}


class GenerateRequest(BaseModel):
    name: str
    config_json: str
    output_format: str = "jsonl"
    num_rows: int = 100


def _run_generation(job_id: str, req: GenerateRequest) -> None:
    output_dir = config.DESIGNER_DIR / req.name
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"data.{req.output_format}"

    config_file = output_dir / "config.json"
    config_file.write_text(req.config_json)

    _jobs[job_id]["status"] = "running"

    try:
        result = subprocess.run(
            [
                "python", "-c",
                f"""
import json, pathlib
from data_designer.interface import DataDesigner
import data_designer.config as dd

cfg = json.loads(pathlib.Path("{config_file}").read_text())
designer = DataDesigner()
builder = dd.DataDesignerConfigBuilder()

for col in cfg.get("columns", []):
    col_type = col.pop("type", "sampler")
    builder.add_column(**col)

result = designer.preview(config_builder=builder)
rows = result.to_list() if hasattr(result, 'to_list') else []

out = pathlib.Path("{output_file}")
out.write_text("\\n".join(json.dumps(r) for r in rows[:{req.num_rows}]))
""",
            ],
            capture_output=True, text=True, timeout=600,
        )
        if result.returncode == 0:
            _jobs[job_id]["status"] = "complete"
            _jobs[job_id]["output"] = str(output_file)
        else:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = result.stderr[-500:] if result.stderr else "Unknown error"
    except Exception as exc:
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = str(exc)
    finally:
        _jobs[job_id]["finished_at"] = time.time()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_status():
    info = _check_installed()
    providers = _read_yaml(config.DESIGNER_CONFIG_DIR / "model_providers.yaml")
    models = _read_yaml(config.DESIGNER_CONFIG_DIR / "model_configs.yaml")
    datasets = _scan_datasets()

    provider_count = len(providers) if isinstance(providers, (list, dict)) else 0
    model_count = len(models) if isinstance(models, (list, dict)) else 0

    return {
        **info,
        "config_dir": str(config.DESIGNER_CONFIG_DIR),
        "data_dir": str(config.DESIGNER_DIR),
        "provider_count": provider_count,
        "model_count": model_count,
        "dataset_count": len(datasets),
    }


@router.get("/providers")
async def list_providers():
    data = _read_yaml(config.DESIGNER_CONFIG_DIR / "model_providers.yaml")
    if data is None:
        return []
    if isinstance(data, dict):
        result = []
        for name, cfg in data.items():
            entry = {"name": name}
            if isinstance(cfg, dict):
                entry.update({k: v for k, v in cfg.items() if k != "api_key"})
                if "api_key" in cfg and cfg["api_key"]:
                    entry["api_key_set"] = True
            result.append(entry)
        return result
    return data


@router.get("/models")
async def list_models():
    data = _read_yaml(config.DESIGNER_CONFIG_DIR / "model_configs.yaml")
    if data is None:
        return []
    if isinstance(data, dict):
        return [{"alias": k, **(v if isinstance(v, dict) else {})} for k, v in data.items()]
    return data


@router.get("/datasets")
async def list_datasets():
    return _scan_datasets()


@router.get("/datasets/{dataset_path:path}")
async def preview_dataset(dataset_path: str, limit: int = Query(20, le=200)):
    full = config.DESIGNER_DIR / dataset_path
    if not full.exists() or not full.is_file():
        raise HTTPException(status_code=404, detail="Dataset file not found")
    try:
        rows = _preview_file(full, limit=limit)
        return {"path": dataset_path, "rows": rows, "count": len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/generate")
async def start_generation(req: GenerateRequest):
    job_id = f"gen-{int(time.time())}-{req.name}"
    _jobs[job_id] = {
        "id": job_id,
        "name": req.name,
        "status": "queued",
        "started_at": time.time(),
        "finished_at": None,
        "output": None,
        "error": None,
    }
    thread = threading.Thread(target=_run_generation, args=(job_id, req), daemon=True)
    thread.start()
    return _jobs[job_id]


@router.get("/jobs")
async def list_jobs():
    return list(_jobs.values())
