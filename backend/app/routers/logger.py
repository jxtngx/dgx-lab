from __future__ import annotations

import json
import sqlite3
from itertools import combinations
from math import factorial
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app import config

router = APIRouter()


def _scan_experiments() -> list[dict]:
    base = config.EXPERIMENTS_DIR
    if not base.exists():
        return []

    experiments = []
    for exp_dir in sorted(base.iterdir()):
        if not exp_dir.is_dir() or exp_dir.name.startswith("."):
            continue

        runs_dir = exp_dir / "runs"
        run_dirs = sorted(runs_dir.iterdir()) if runs_dir.exists() else []
        run_dirs = [r for r in run_dirs if r.is_dir() and not r.name.startswith(".")]

        best_loss = None
        best_run = None
        for rd in run_dirs:
            summary = _read_run_summary(rd)
            if summary and summary.get("best_loss") is not None:
                if best_loss is None or summary["best_loss"] < best_loss:
                    best_loss = summary["best_loss"]
                    best_run = rd.name

        experiments.append({
            "id": exp_dir.name,
            "name": exp_dir.name,
            "run_count": len(run_dirs),
            "best_loss": best_loss,
            "best_run": best_run,
        })

    return experiments


def _read_run_summary(run_dir: Path) -> dict | None:
    summary_file = run_dir / "summary.json"
    if summary_file.exists():
        try:
            return json.loads(summary_file.read_text())
        except (json.JSONDecodeError, OSError):
            pass

    metrics = _read_metrics_from_sqlite(run_dir)
    if metrics:
        losses = [m["loss"] for m in metrics if m.get("loss") is not None]
        if losses:
            best = min(losses)
            best_step = next(m["step"] for m in metrics if m.get("loss") == best)
            return {"best_loss": best, "best_loss_step": best_step}

    return None


def _read_run_config(run_dir: Path) -> dict | None:
    for name in ("config.json", "hparams.json", "config.yaml"):
        f = run_dir / name
        if f.exists():
            try:
                if name.endswith(".yaml"):
                    import yaml
                    return yaml.safe_load(f.read_text())
                return json.loads(f.read_text())
            except Exception:
                continue
    return None


def _read_metrics_from_sqlite(run_dir: Path) -> list[dict]:
    for db_name in ("metrics.db", "metrics.sqlite", "logs.db"):
        db_path = run_dir / db_name
        if db_path.exists():
            try:
                conn = sqlite3.connect(str(db_path))
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT * FROM metrics ORDER BY step ASC"
                ).fetchall()
                conn.close()
                return [dict(r) for r in rows]
            except Exception:
                continue
    return []


def _read_metrics_from_parquet(run_dir: Path) -> list[dict]:
    for pq_name in ("metrics.parquet", "train_metrics.parquet"):
        pq_path = run_dir / pq_name
        if pq_path.exists():
            try:
                import pyarrow.parquet as pq

                table = pq.read_table(str(pq_path))
                return table.to_pylist()
            except Exception:
                continue
    return []


def _read_metrics_from_jsonl(run_dir: Path) -> list[dict]:
    for jl_name in ("metrics.jsonl", "train.jsonl", "events.jsonl"):
        jl_path = run_dir / jl_name
        if jl_path.exists():
            try:
                records = []
                for line in jl_path.read_text().strip().split("\n"):
                    if line.strip():
                        records.append(json.loads(line))
                return records
            except Exception:
                continue
    return []


def _list_checkpoints(run_dir: Path) -> list[dict]:
    ckpt_dir = run_dir / "checkpoints"
    if not ckpt_dir.exists():
        ckpt_candidates = list(run_dir.glob("checkpoint-*"))
        if not ckpt_candidates:
            return []
        return [
            {"name": c.name, "size_bytes": sum(f.stat().st_size for f in c.rglob("*") if f.is_file()) if c.is_dir() else c.stat().st_size}
            for c in sorted(ckpt_candidates)
        ]

    return [
        {"name": c.name, "size_bytes": sum(f.stat().st_size for f in c.rglob("*") if f.is_file()) if c.is_dir() else c.stat().st_size}
        for c in sorted(ckpt_dir.iterdir())
        if not c.name.startswith(".")
    ]


@router.get("/experiments")
async def list_experiments():
    return _scan_experiments()


@router.get("/experiments/{experiment_id}/runs")
async def list_runs(experiment_id: str):
    exp_dir = config.EXPERIMENTS_DIR / experiment_id
    if not exp_dir.exists():
        raise HTTPException(status_code=404, detail="Experiment not found")

    runs_dir = exp_dir / "runs"
    if not runs_dir.exists():
        return []

    runs = []
    for rd in sorted(runs_dir.iterdir()):
        if not rd.is_dir() or rd.name.startswith("."):
            continue

        run_config = _read_run_config(rd)
        summary = _read_run_summary(rd)
        checkpoints = _list_checkpoints(rd)

        status = "complete"
        status_file = rd / "status"
        if status_file.exists():
            status = status_file.read_text().strip()

        runs.append({
            "id": rd.name,
            "status": status,
            "config": run_config,
            "best_loss": summary.get("best_loss") if summary else None,
            "best_loss_step": summary.get("best_loss_step") if summary else None,
            "checkpoints": len(checkpoints),
        })

    return runs


@router.get("/experiments/{experiment_id}/runs/{run_id}/metrics")
async def get_run_metrics(experiment_id: str, run_id: str):
    run_dir = config.EXPERIMENTS_DIR / experiment_id / "runs" / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")

    metrics = _read_metrics_from_sqlite(run_dir)
    if not metrics:
        metrics = _read_metrics_from_parquet(run_dir)
    if not metrics:
        metrics = _read_metrics_from_jsonl(run_dir)

    return metrics


@router.get("/experiments/{experiment_id}/runs/{run_id}/checkpoints")
async def get_run_checkpoints(experiment_id: str, run_id: str):
    run_dir = config.EXPERIMENTS_DIR / experiment_id / "runs" / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="Run not found")
    return _list_checkpoints(run_dir)


def _compute_shapley(runs: list[dict], metric: str = "best_loss") -> list[dict]:
    """Compute exact Shapley values for hyperparameter importance.

    Each run must have a 'config' dict and the target metric.
    Returns sorted list of {feature, shapley_value, abs_shapley} dicts.
    """
    valid = [r for r in runs if r.get("config") and r.get(metric) is not None]
    if len(valid) < 2:
        return []

    features = sorted(
        {k for r in valid for k in r["config"].keys()}
    )
    if not features:
        return []

    n = len(features)

    # Normalize feature values to [0,1] for fair comparison
    feat_vals: dict[str, list[float]] = {}
    for f in features:
        raw = []
        for r in valid:
            v = r["config"].get(f)
            try:
                raw.append(float(v))
            except (TypeError, ValueError):
                raw.append(0.0)
        lo, hi = min(raw), max(raw)
        feat_vals[f] = [(v - lo) / (hi - lo) if hi > lo else 0.0 for v in raw]

    targets = [r[metric] for r in valid]

    def coalition_pred(subset: set[str]) -> float:
        """Average metric weighted by feature-value similarity within coalition."""
        if not subset:
            return sum(targets) / len(targets)

        # For each pair of runs, compute similarity on the coalition features
        # then return weighted-average metric
        total_w = 0.0
        total_v = 0.0
        for i, ri in enumerate(valid):
            w = 1.0
            for j, rj in enumerate(valid):
                if i == j:
                    continue
                sim = 1.0
                for f in subset:
                    diff = abs(feat_vals[f][i] - feat_vals[f][j])
                    sim *= 1.0 - diff
                w += sim
            total_w += w
            total_v += w * targets[i]
        return total_v / total_w if total_w > 0 else sum(targets) / len(targets)

    shapley: dict[str, float] = {f: 0.0 for f in features}

    for f in features:
        others = [o for o in features if o != f]
        for size in range(0, n):
            for subset in combinations(others, size):
                s = set(subset)
                s_with = s | {f}
                marginal = coalition_pred(s_with) - coalition_pred(s)
                weight = factorial(size) * factorial(n - size - 1) / factorial(n)
                shapley[f] += weight * marginal

    max_abs = max(abs(v) for v in shapley.values()) or 1.0
    return sorted(
        [
            {
                "feature": f,
                "shapley_value": round(v, 6),
                "importance": round(abs(v) / max_abs, 4),
            }
            for f, v in shapley.items()
        ],
        key=lambda x: -x["importance"],
    )


@router.get("/experiments/{experiment_id}/importance")
async def get_feature_importance(experiment_id: str):
    exp_dir = config.EXPERIMENTS_DIR / experiment_id
    if not exp_dir.exists():
        raise HTTPException(status_code=404, detail="Experiment not found")

    runs_dir = exp_dir / "runs"
    if not runs_dir.exists():
        return {"features": [], "run_count": 0}

    runs = []
    for rd in sorted(runs_dir.iterdir()):
        if not rd.is_dir() or rd.name.startswith("."):
            continue
        run_config = _read_run_config(rd)
        summary = _read_run_summary(rd)
        if run_config and summary and summary.get("best_loss") is not None:
            runs.append({
                "id": rd.name,
                "config": run_config,
                "best_loss": summary["best_loss"],
            })

    features = _compute_shapley(runs, metric="best_loss")
    return {
        "features": features,
        "run_count": len(runs),
        "metric": "best_loss",
        "direction": "minimize",
    }
