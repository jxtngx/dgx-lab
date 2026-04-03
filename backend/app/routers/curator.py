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
        import importlib.metadata
        version = importlib.metadata.version("nemo-curator")
        return {"installed": True, "version": version}
    except Exception:
        return {"installed": False, "version": None}


def _scan_datasets() -> list[dict]:
    base = config.CURATOR_DIR
    if not base.exists():
        return []

    datasets: list[dict] = []
    seen_dirs: set[str] = set()

    for f in sorted(base.rglob("*")):
        if f.is_dir() or f.name.startswith("."):
            continue
        if f.suffix not in (".jsonl", ".json", ".parquet", ".csv"):
            continue

        parent_key = str(f.parent.relative_to(base))
        if parent_key == ".":
            parent_key = f.stem

        if parent_key in seen_dirs:
            entry = next(d for d in datasets if d["name"] == parent_key)
            entry["file_count"] += 1
            entry["size_bytes"] += f.stat().st_size
            continue

        seen_dirs.add(parent_key)
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
            "name": parent_key,
            "path": str(f.parent if f.parent != base else f),
            "format": f.suffix.lstrip("."),
            "size_bytes": stat.st_size,
            "modified": stat.st_mtime,
            "row_count": row_count,
            "file_count": 1,
        })

    return datasets


def _preview_file(path: Path, limit: int = 20) -> list[dict]:
    target = path
    if path.is_dir():
        candidates = sorted(path.glob("*.jsonl")) + sorted(path.glob("*.parquet")) + sorted(path.glob("*.json"))
        if not candidates:
            return []
        target = candidates[0]

    if target.suffix == ".jsonl":
        rows = []
        for line in target.read_text().strip().split("\n"):
            if line.strip():
                rows.append(json.loads(line))
                if len(rows) >= limit:
                    break
        return rows
    elif target.suffix == ".json":
        data = json.loads(target.read_text())
        return data[:limit] if isinstance(data, list) else [data]
    elif target.suffix == ".parquet":
        import pyarrow.parquet as pq
        table = pq.read_table(str(target))
        return table.slice(0, limit).to_pylist()
    elif target.suffix == ".csv":
        import csv
        rows = []
        with open(target) as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                rows.append(dict(row))
                if len(rows) >= limit:
                    break
        return rows
    return []


PIPELINE_STAGES = [
    {"id": "read", "name": "Read", "category": "io", "description": "Load data from JSONL, Parquet, or other formats"},
    {"id": "unicode_reform", "name": "Unicode Reformer", "category": "cleaning", "description": "Normalize Unicode characters"},
    {"id": "whitespace", "name": "Whitespace Normalizer", "category": "cleaning", "description": "Collapse and normalize whitespace"},
    {"id": "html_strip", "name": "HTML Stripper", "category": "cleaning", "description": "Remove HTML tags from text"},
    {"id": "url_filter", "name": "URL Filter", "category": "filtering", "description": "Filter documents by URL patterns"},
    {"id": "word_count", "name": "Word Count Filter", "category": "filtering", "description": "Filter by document word count"},
    {"id": "quality_classifier", "name": "Quality Classifier", "category": "filtering", "description": "GPU-accelerated quality scoring"},
    {"id": "language_id", "name": "Language Identification", "category": "filtering", "description": "Detect and filter by language"},
    {"id": "exact_dedup", "name": "Exact Deduplication", "category": "dedup", "description": "Remove exact duplicate documents"},
    {"id": "fuzzy_dedup", "name": "Fuzzy Deduplication", "category": "dedup", "description": "MinHash LSH near-duplicate removal"},
    {"id": "semantic_dedup", "name": "Semantic Deduplication", "category": "dedup", "description": "Embedding-based deduplication"},
    {"id": "pii_redact", "name": "PII Redaction", "category": "safety", "description": "Detect and redact personally identifiable information"},
    {"id": "write", "name": "Write", "category": "io", "description": "Export curated data to JSONL or Parquet"},
]


# ---------------------------------------------------------------------------
# Job tracking
# ---------------------------------------------------------------------------

_jobs: dict[str, dict] = {}


class PipelineRequest(BaseModel):
    name: str
    input_path: str
    output_path: str | None = None
    stages: list[str]
    text_field: str = "text"


def _run_pipeline(job_id: str, req: PipelineRequest) -> None:
    _jobs[job_id]["status"] = "running"

    output_dir = Path(req.output_path) if req.output_path else config.CURATOR_DIR / f"{req.name}-output"
    output_dir.mkdir(parents=True, exist_ok=True)

    stage_imports = []
    stage_calls = []
    for stage in req.stages:
        if stage == "unicode_reform":
            stage_imports.append("from nemo_curator.modules import UnicodeReformatter")
            stage_calls.append(f'dataset = UnicodeReformatter().process(dataset)')
        elif stage == "exact_dedup":
            stage_imports.append("from nemo_curator.modules import ExactDuplicates")
            stage_calls.append(f'dataset = ExactDuplicates(id_field="id", text_field="{req.text_field}").process(dataset)')
        elif stage == "word_count":
            stage_imports.append("from nemo_curator.filters import WordCountFilter")
            stage_calls.append(f'dataset = dataset.filter(WordCountFilter(min_words=10))')
        elif stage == "language_id":
            stage_imports.append("from nemo_curator.modules import FastTextLangId")
            stage_calls.append(f'dataset = FastTextLangId(text_field="{req.text_field}").process(dataset)')

    script = f"""
import nemo_curator as nc
{chr(10).join(stage_imports)}

dataset = nc.DocumentDataset.read_jsonl("{req.input_path}")
{chr(10).join(stage_calls)}
dataset.to_jsonl("{output_dir}")
"""

    try:
        result = subprocess.run(
            ["python", "-c", script],
            capture_output=True, text=True, timeout=3600,
        )
        if result.returncode == 0:
            _jobs[job_id]["status"] = "complete"
            _jobs[job_id]["output"] = str(output_dir)
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
    datasets = _scan_datasets()
    return {
        **info,
        "data_dir": str(config.CURATOR_DIR),
        "dataset_count": len(datasets),
        "active_jobs": sum(1 for j in _jobs.values() if j["status"] == "running"),
    }


@router.get("/stages")
async def list_stages():
    return PIPELINE_STAGES


@router.get("/datasets")
async def list_datasets():
    return _scan_datasets()


@router.get("/datasets/{dataset_path:path}")
async def preview_dataset(dataset_path: str, limit: int = Query(20, le=200)):
    full = config.CURATOR_DIR / dataset_path
    if not full.exists():
        raise HTTPException(status_code=404, detail="Dataset not found")
    try:
        rows = _preview_file(full, limit=limit)
        return {"path": dataset_path, "rows": rows, "count": len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/pipelines/run")
async def run_pipeline(req: PipelineRequest):
    job_id = f"cur-{int(time.time())}-{req.name}"
    _jobs[job_id] = {
        "id": job_id,
        "name": req.name,
        "status": "queued",
        "stages": req.stages,
        "input_path": req.input_path,
        "started_at": time.time(),
        "finished_at": None,
        "output": None,
        "error": None,
    }
    thread = threading.Thread(target=_run_pipeline, args=(job_id, req), daemon=True)
    thread.start()
    return _jobs[job_id]


@router.get("/jobs")
async def list_jobs():
    return list(_jobs.values())
