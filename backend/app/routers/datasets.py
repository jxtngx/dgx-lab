from __future__ import annotations

import csv
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.csv as pa_csv
import pyarrow.parquet as pq
from fastapi import APIRouter, HTTPException, Query
from huggingface_hub import HfApi, scan_cache_dir
from pydantic import BaseModel

from app import config

logger = logging.getLogger(__name__)
router = APIRouter()
_hf_api = HfApi()

_downloads: dict[str, dict] = {}
_download_threads: dict[str, threading.Thread] = {}


def _bytes_to_mb(b: int) -> float:
    return round(b / (1024 ** 2), 1)


def _detect_format(path: Path) -> str | None:
    suffix = path.suffix.lower()
    if suffix == ".parquet":
        return "parquet"
    if suffix in (".jsonl", ".ndjson"):
        return "jsonl"
    if suffix == ".json":
        return "json"
    if suffix == ".csv":
        return "csv"
    if suffix == ".arrow":
        return "arrow"
    return None


def _find_data_files(base: Path) -> list[Path]:
    """Find all readable data files under a directory."""
    files = []
    if not base.exists():
        return files
    for f in sorted(base.rglob("*")):
        if f.is_dir() or f.name.startswith("."):
            continue
        if _detect_format(f):
            files.append(f)
    return files


MAX_COLUMN_NAMES = 6


def _quick_stats(data_files: list[Path]) -> dict:
    """Extract row count and column info from the first data file without full reads."""
    num_rows: int | None = None
    num_columns: int | None = None
    column_names: list[str] = []

    first = next((f for f in data_files if _detect_format(f)), None)
    if first is None:
        return {"num_rows": None, "num_columns": None, "column_names": []}

    fmt = _detect_format(first)
    try:
        if fmt == "parquet":
            meta = pq.read_metadata(str(first))
            schema = pq.read_schema(str(first))
            num_rows = meta.num_rows
            column_names = list(schema.names)[:MAX_COLUMN_NAMES]
            num_columns = len(schema.names)
        elif fmt == "csv":
            with open(first, newline="") as f:
                header = next(csv.reader(f), None)
            if header:
                column_names = header[:MAX_COLUMN_NAMES]
                num_columns = len(header)
        elif fmt in ("jsonl", "ndjson"):
            with open(first) as f:
                line = f.readline().strip()
            if line:
                row = json.loads(line)
                if isinstance(row, dict):
                    keys = list(row.keys())
                    column_names = keys[:MAX_COLUMN_NAMES]
                    num_columns = len(keys)
    except Exception:
        pass

    return {"num_rows": num_rows, "num_columns": num_columns, "column_names": column_names}


def _scan_local_datasets() -> list[dict]:
    """Scan ~/.dgx-lab/datasets/ for local dataset directories."""
    base = config.DATASETS_DIR
    if not base.exists():
        return []

    datasets = []
    for entry in sorted(base.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue

        data_files = _find_data_files(entry)
        if not data_files:
            continue

        total_size = sum(f.stat().st_size for f in data_files)
        formats = list({_detect_format(f) for f in data_files if _detect_format(f)})

        stats = _quick_stats(data_files)
        datasets.append({
            "id": entry.name,
            "source": "local",
            "path": str(entry),
            "num_files": len(data_files),
            "size_mb": _bytes_to_mb(total_size),
            "formats": formats,
            "num_rows": stats["num_rows"],
            "num_columns": stats["num_columns"],
            "column_names": stats["column_names"],
            "file_names": [str(f.relative_to(entry)) for f in data_files],
            "files": [
                {
                    "name": str(f.relative_to(entry)),
                    "format": _detect_format(f),
                    "size_mb": _bytes_to_mb(f.stat().st_size),
                }
                for f in data_files
            ],
        })

    return datasets


def _scan_hf_datasets() -> list[dict]:
    """Scan HuggingFace cache for downloaded datasets."""
    try:
        cache = scan_cache_dir(config.MODELS_DIR)
    except Exception:
        try:
            cache = scan_cache_dir()
        except Exception:
            return []

    datasets = []
    for repo in cache.repos:
        if repo.repo_type != "dataset":
            continue

        repo_path = Path(repo.repo_path)
        data_files = _find_data_files(repo_path)
        formats = list({_detect_format(f) for f in data_files if _detect_format(f)})

        stats = _quick_stats(data_files)
        datasets.append({
            "id": repo.repo_id,
            "source": "huggingface",
            "path": str(repo_path),
            "num_files": len(data_files),
            "size_mb": _bytes_to_mb(repo.size_on_disk),
            "formats": formats,
            "num_rows": stats["num_rows"],
            "num_columns": stats["num_columns"],
            "column_names": stats["column_names"],
            "file_names": [str(f.relative_to(repo_path)) for f in data_files],
            "refs": [r.name if hasattr(r, "name") else str(r) for r in repo.refs],
        })

    return datasets


def _read_parquet_page(path: Path, offset: int, limit: int) -> dict:
    table = pq.read_table(str(path))
    total = table.num_rows
    columns = [
        {"name": f.name, "type": str(f.type)}
        for f in table.schema
    ]
    sliced = table.slice(offset, limit)
    rows = sliced.to_pydict()
    # Convert to list of dicts
    row_list = []
    col_names = list(rows.keys())
    num = len(rows[col_names[0]]) if col_names else 0
    for i in range(num):
        row = {}
        for c in col_names:
            val = rows[c][i]
            # Convert non-serializable types
            if hasattr(val, "as_py"):
                val = val.as_py()
            if isinstance(val, bytes):
                val = val.decode("utf-8", errors="replace")
            row[c] = val
        row_list.append(row)

    return {"columns": columns, "rows": row_list, "total": total}


def _read_jsonl_page(path: Path, offset: int, limit: int) -> dict:
    rows = []
    all_keys: dict[str, str] = {}
    total = 0

    with open(path) as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            total += 1
            if offset <= i < offset + limit:
                try:
                    row = json.loads(line)
                    rows.append(row)
                    for k, v in row.items():
                        if k not in all_keys:
                            all_keys[k] = type(v).__name__
                except json.JSONDecodeError:
                    continue

    columns = [{"name": k, "type": t} for k, t in all_keys.items()]
    return {"columns": columns, "rows": rows, "total": total}


def _read_json_page(path: Path, offset: int, limit: int) -> dict:
    data = json.loads(path.read_text())
    if isinstance(data, dict):
        # Could be {"data": [...]} or similar
        for key in ("data", "rows", "records", "items"):
            if key in data and isinstance(data[key], list):
                data = data[key]
                break
        if isinstance(data, dict):
            data = [data]

    if not isinstance(data, list):
        return {"columns": [], "rows": [], "total": 0}

    total = len(data)
    sliced = data[offset : offset + limit]
    all_keys: dict[str, str] = {}
    for row in sliced:
        if isinstance(row, dict):
            for k, v in row.items():
                if k not in all_keys:
                    all_keys[k] = type(v).__name__

    columns = [{"name": k, "type": t} for k, t in all_keys.items()]
    return {"columns": columns, "rows": sliced, "total": total}


def _read_csv_page(path: Path, offset: int, limit: int) -> dict:
    rows = []
    columns = []
    total = 0

    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames:
            columns = [{"name": n, "type": "str"} for n in reader.fieldnames]

        for i, row in enumerate(reader):
            total += 1
            if offset <= i < offset + limit:
                rows.append(dict(row))

    return {"columns": columns, "rows": rows, "total": total}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
async def list_datasets():
    local = _scan_local_datasets()
    hf = _scan_hf_datasets()
    return {"datasets": local + hf, "total": len(local) + len(hf)}


@router.get("/search")
async def search_hub(q: str = Query(..., min_length=1), limit: int = Query(20, le=50)):
    results = _hf_api.list_datasets(search=q, limit=limit, sort="downloads", direction=-1)
    return [
        {
            "id": d.id,
            "downloads": d.downloads,
            "likes": d.likes,
            "last_modified": str(d.last_modified) if d.last_modified else None,
            "tags": list(d.tags or [])[:5],
        }
        for d in results
    ]


class PullDatasetRequest(BaseModel):
    repo_id: str
    revision: str | None = None


def _do_download(repo_id: str, revision: str | None) -> None:
    _downloads[repo_id] = {
        "status": "downloading",
        "started_at": time.time(),
        "error": None,
    }
    try:
        path = _hf_api.snapshot_download(
            repo_id=repo_id,
            repo_type="dataset",
            revision=revision,
        )
        _downloads[repo_id] = {
            "status": "complete",
            "started_at": _downloads[repo_id]["started_at"],
            "finished_at": time.time(),
            "path": str(path),
            "error": None,
        }
    except Exception as exc:
        logger.exception("Dataset download failed for %s", repo_id)
        _downloads[repo_id] = {
            "status": "error",
            "error": str(exc),
            "started_at": _downloads[repo_id]["started_at"],
            "finished_at": time.time(),
        }


@router.post("/pull")
async def pull_dataset(req: PullDatasetRequest):
    active = _downloads.get(req.repo_id)
    if active and active["status"] == "downloading":
        t = _download_threads.get(req.repo_id)
        if t and t.is_alive():
            return {"status": "already_downloading", "repo_id": req.repo_id}

    thread = threading.Thread(
        target=_do_download,
        args=(req.repo_id, req.revision),
        daemon=True,
    )
    _download_threads[req.repo_id] = thread
    thread.start()
    return {"status": "started", "repo_id": req.repo_id}


@router.get("/downloads")
async def list_downloads():
    result = {}
    for repo_id, info in _downloads.items():
        entry = {**info}
        if info["status"] == "downloading":
            entry["elapsed_s"] = round(time.time() - info["started_at"], 1)
        result[repo_id] = entry
    return result


@router.get("/{dataset_id:path}/files")
async def list_dataset_files(dataset_id: str):
    # Check local first
    local_path = config.DATASETS_DIR / dataset_id
    if local_path.exists() and local_path.is_dir():
        files = _find_data_files(local_path)
        return [
            {
                "name": str(f.relative_to(local_path)),
                "format": _detect_format(f),
                "size_mb": _bytes_to_mb(f.stat().st_size),
                "path": str(f),
            }
            for f in files
        ]

    # Check HF cache
    try:
        cache = scan_cache_dir(config.MODELS_DIR)
    except Exception:
        cache = scan_cache_dir()

    for repo in cache.repos:
        if repo.repo_id == dataset_id and repo.repo_type == "dataset":
            repo_path = Path(repo.repo_path)
            files = _find_data_files(repo_path)
            return [
                {
                    "name": str(f.relative_to(repo_path)),
                    "format": _detect_format(f),
                    "size_mb": _bytes_to_mb(f.stat().st_size),
                    "path": str(f),
                }
                for f in files
            ]

    raise HTTPException(status_code=404, detail="Dataset not found")


@router.get("/{dataset_id:path}/preview")
async def preview_dataset(
    dataset_id: str,
    file: str = Query(None, description="Specific file to preview"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
):
    # Resolve dataset path
    base_path = config.DATASETS_DIR / dataset_id
    if not base_path.exists():
        # Try HF cache
        try:
            cache = scan_cache_dir(config.MODELS_DIR)
        except Exception:
            cache = scan_cache_dir()

        for repo in cache.repos:
            if repo.repo_id == dataset_id and repo.repo_type == "dataset":
                base_path = Path(repo.repo_path)
                break
        else:
            raise HTTPException(status_code=404, detail="Dataset not found")

    # Find the file to preview
    if file:
        target = base_path / file
        if not target.exists():
            # Search in snapshots for HF cache
            for candidate in base_path.rglob(file.split("/")[-1]):
                if candidate.is_file():
                    target = candidate
                    break
        if not target.exists():
            raise HTTPException(status_code=404, detail="File not found")
    else:
        # Pick the first data file
        data_files = _find_data_files(base_path)
        if not data_files:
            raise HTTPException(status_code=404, detail="No data files found")
        target = data_files[0]

    fmt = _detect_format(target)
    if fmt == "parquet":
        return _read_parquet_page(target, offset, limit)
    elif fmt in ("jsonl", "ndjson"):
        return _read_jsonl_page(target, offset, limit)
    elif fmt == "json":
        return _read_json_page(target, offset, limit)
    elif fmt == "csv":
        return _read_csv_page(target, offset, limit)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")


# ---------------------------------------------------------------------------
# Query endpoint — PyArrow-based filtering/aggregation
# ---------------------------------------------------------------------------

def _load_as_arrow_table(path: Path) -> pa.Table:
    fmt = _detect_format(path)
    if fmt == "parquet":
        return pq.read_table(str(path))
    elif fmt == "csv":
        return pa_csv.read_csv(str(path))
    elif fmt in ("jsonl", "ndjson"):
        rows = []
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        rows.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        if not rows:
            return pa.table({})
        return pa.Table.from_pylist(rows)
    elif fmt == "json":
        data = json.loads(path.read_text())
        if isinstance(data, dict):
            for key in ("data", "rows", "records", "items"):
                if key in data and isinstance(data[key], list):
                    data = data[key]
                    break
            if isinstance(data, dict):
                data = [data]
        if not isinstance(data, list) or not data:
            return pa.table({})
        return pa.Table.from_pylist(data)
    raise HTTPException(status_code=400, detail=f"Unsupported format for query: {fmt}")


def _arrow_to_rows(table: pa.Table) -> list[dict[str, Any]]:
    d = table.to_pydict()
    cols = list(d.keys())
    if not cols:
        return []
    n = len(d[cols[0]])
    rows = []
    for i in range(n):
        row = {}
        for c in cols:
            val = d[c][i]
            if hasattr(val, "as_py"):
                val = val.as_py()
            if isinstance(val, bytes):
                val = val.decode("utf-8", errors="replace")
            row[c] = val
        rows.append(row)
    return rows


def _apply_filter(table: pa.Table, col: str, op: str, value: str) -> pa.Table:
    """Apply a single filter predicate to the table."""
    if col not in table.column_names:
        raise HTTPException(status_code=400, detail=f"Unknown column: {col}")

    field = table.schema.field(col)
    arr = table.column(col)

    # Cast value to match column type
    try:
        if pa.types.is_integer(field.type):
            typed_val = int(value)
        elif pa.types.is_floating(field.type):
            typed_val = float(value)
        elif pa.types.is_boolean(field.type):
            typed_val = value.lower() in ("true", "1", "yes")
        else:
            typed_val = value
    except (ValueError, TypeError):
        typed_val = value

    ops = {
        "eq": pc.equal,
        "ne": pc.not_equal,
        "gt": pc.greater,
        "ge": pc.greater_equal,
        "lt": pc.less,
        "le": pc.less_equal,
    }

    if op == "contains":
        mask = pc.match_substring(arr.cast(pa.string()), value)
    elif op == "startswith":
        mask = pc.starts_with(arr.cast(pa.string()), value)
    elif op == "endswith":
        mask = pc.ends_with(arr.cast(pa.string()), value)
    elif op in ops:
        mask = ops[op](arr, pa.scalar(typed_val, type=field.type) if not isinstance(typed_val, str) else typed_val)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown operator: {op}")

    return table.filter(mask)


class QueryRequest(BaseModel):
    dataset_id: str
    file: str | None = None
    filters: list[dict[str, str]] = []
    sort_by: str | None = None
    sort_desc: bool = False
    columns: list[str] | None = None
    offset: int = 0
    limit: int = 100
    agg: str | None = None
    agg_column: str | None = None
    group_by: str | None = None


def _resolve_file(dataset_id: str, file: str | None) -> Path:
    """Resolve a dataset file path from dataset_id and optional file name."""
    base_path = config.DATASETS_DIR / dataset_id
    if not base_path.exists():
        try:
            cache = scan_cache_dir(config.MODELS_DIR)
        except Exception:
            cache = scan_cache_dir()
        for repo in cache.repos:
            if repo.repo_id == dataset_id and repo.repo_type == "dataset":
                base_path = Path(repo.repo_path)
                break
        else:
            raise HTTPException(status_code=404, detail="Dataset not found")

    if file:
        target = base_path / file
        if not target.exists():
            for candidate in base_path.rglob(file.split("/")[-1]):
                if candidate.is_file():
                    target = candidate
                    break
        if not target.exists():
            raise HTTPException(status_code=404, detail="File not found")
        return target

    data_files = _find_data_files(base_path)
    if not data_files:
        raise HTTPException(status_code=404, detail="No data files found")
    return data_files[0]


@router.post("/query")
async def query_dataset(req: QueryRequest):
    """Filter, sort, aggregate dataset files using PyArrow compute."""
    target = _resolve_file(req.dataset_id, req.file)
    table = _load_as_arrow_table(target)
    total_before_filter = table.num_rows

    for f in req.filters:
        col = f.get("column", "")
        op = f.get("op", "eq")
        val = f.get("value", "")
        if col and val:
            table = _apply_filter(table, col, op, val)

    matched = table.num_rows

    # Aggregation
    if req.agg and req.agg_column:
        if req.agg_column not in table.column_names:
            raise HTTPException(status_code=400, detail=f"Unknown column: {req.agg_column}")
        arr = table.column(req.agg_column)
        agg_funcs: dict[str, Any] = {
            "count": lambda a: {"result": len(a)},
            "sum": lambda a: {"result": pc.sum(a).as_py()},
            "mean": lambda a: {"result": pc.mean(a).as_py()},
            "min": lambda a: {"result": pc.min(a).as_py()},
            "max": lambda a: {"result": pc.max(a).as_py()},
            "stddev": lambda a: {"result": pc.stddev(a).as_py()},
            "count_distinct": lambda a: {"result": pc.count_distinct(a).as_py()},
        }
        if req.agg not in agg_funcs:
            raise HTTPException(status_code=400, detail=f"Unknown aggregation: {req.agg}")

        if req.group_by and req.group_by in table.column_names:
            groups = pc.unique(table.column(req.group_by)).to_pylist()
            group_results = []
            for g in groups[:200]:
                mask = pc.equal(table.column(req.group_by), g)
                subset = table.filter(mask)
                try:
                    r = agg_funcs[req.agg](subset.column(req.agg_column))
                    group_results.append({"group": g, **r})
                except Exception:
                    group_results.append({"group": g, "result": None})
            return {
                "type": "aggregation",
                "agg": req.agg,
                "column": req.agg_column,
                "group_by": req.group_by,
                "results": group_results,
                "total": total_before_filter,
                "matched": matched,
            }

        try:
            r = agg_funcs[req.agg](arr)
            return {
                "type": "aggregation",
                "agg": req.agg,
                "column": req.agg_column,
                "total": total_before_filter,
                "matched": matched,
                **r,
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Aggregation error: {e}")

    # Column selection
    if req.columns:
        valid = [c for c in req.columns if c in table.column_names]
        if valid:
            table = table.select(valid)

    # Sorting
    if req.sort_by and req.sort_by in table.column_names:
        order = "descending" if req.sort_desc else "ascending"
        indices = pc.sort_indices(table.column(req.sort_by), sort_keys=[(req.sort_by, order)])
        table = table.take(indices)

    # Pagination
    sliced = table.slice(req.offset, req.limit)
    columns_meta = [{"name": f.name, "type": str(f.type)} for f in sliced.schema]

    return {
        "type": "rows",
        "columns": columns_meta,
        "rows": _arrow_to_rows(sliced),
        "total": total_before_filter,
        "matched": matched,
        "offset": req.offset,
        "limit": req.limit,
    }
