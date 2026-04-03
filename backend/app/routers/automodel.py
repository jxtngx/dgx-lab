from __future__ import annotations

import json
import subprocess
import threading
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config

router = APIRouter()

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

_jobs: dict[str, dict] = {}
_job_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _check_installed() -> dict:
    try:
        result = subprocess.run(
            ["python", "-c", "import nemo.automodel; print(nemo.automodel.__version__)"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return {"installed": True, "version": result.stdout.strip()}
    except Exception:
        pass

    try:
        import importlib.metadata
        version = importlib.metadata.version("nemo-automodel")
        return {"installed": True, "version": version}
    except Exception:
        return {"installed": False, "version": None}


RECIPES = [
    {
        "id": "sft",
        "name": "Supervised Fine-Tuning",
        "description": "Full-parameter supervised fine-tuning on instruction data",
        "params": [
            {"key": "model", "label": "Model", "type": "text", "default": ""},
            {"key": "dataset", "label": "Dataset path", "type": "text", "default": ""},
            {"key": "num_epochs", "label": "Epochs", "type": "number", "default": 3},
            {"key": "learning_rate", "label": "Learning rate", "type": "number", "default": 2e-5},
            {"key": "batch_size", "label": "Batch size", "type": "number", "default": 4},
            {"key": "max_seq_length", "label": "Max seq length", "type": "number", "default": 2048},
            {"key": "fp8", "label": "FP8 mixed precision", "type": "boolean", "default": False},
        ],
    },
    {
        "id": "lora",
        "name": "LoRA Fine-Tuning",
        "description": "Parameter-efficient fine-tuning with low-rank adaptation",
        "params": [
            {"key": "model", "label": "Model", "type": "text", "default": ""},
            {"key": "dataset", "label": "Dataset path", "type": "text", "default": ""},
            {"key": "num_epochs", "label": "Epochs", "type": "number", "default": 3},
            {"key": "learning_rate", "label": "Learning rate", "type": "number", "default": 1e-4},
            {"key": "batch_size", "label": "Batch size", "type": "number", "default": 8},
            {"key": "lora_rank", "label": "LoRA rank", "type": "number", "default": 16},
            {"key": "lora_alpha", "label": "LoRA alpha", "type": "number", "default": 32},
            {"key": "max_seq_length", "label": "Max seq length", "type": "number", "default": 2048},
        ],
    },
    {
        "id": "pretraining",
        "name": "Pretraining",
        "description": "Full model pretraining from scratch or continued pretraining",
        "params": [
            {"key": "model", "label": "Model", "type": "text", "default": ""},
            {"key": "dataset", "label": "Dataset path", "type": "text", "default": ""},
            {"key": "max_steps", "label": "Max steps", "type": "number", "default": 10000},
            {"key": "learning_rate", "label": "Learning rate", "type": "number", "default": 3e-4},
            {"key": "batch_size", "label": "Batch size", "type": "number", "default": 4},
            {"key": "fp8", "label": "FP8 mixed precision", "type": "boolean", "default": False},
        ],
    },
    {
        "id": "distillation",
        "name": "Knowledge Distillation",
        "description": "Transfer knowledge from a teacher model to a smaller student",
        "params": [
            {"key": "teacher_model", "label": "Teacher model", "type": "text", "default": ""},
            {"key": "student_model", "label": "Student model", "type": "text", "default": ""},
            {"key": "dataset", "label": "Dataset path", "type": "text", "default": ""},
            {"key": "num_epochs", "label": "Epochs", "type": "number", "default": 3},
            {"key": "learning_rate", "label": "Learning rate", "type": "number", "default": 1e-4},
            {"key": "temperature", "label": "Temperature", "type": "number", "default": 2.0},
        ],
    },
    {
        "id": "qat",
        "name": "Quantization-Aware Training",
        "description": "Fine-tune with quantization simulation for deployment",
        "params": [
            {"key": "model", "label": "Model", "type": "text", "default": ""},
            {"key": "dataset", "label": "Dataset path", "type": "text", "default": ""},
            {"key": "num_epochs", "label": "Epochs", "type": "number", "default": 2},
            {"key": "learning_rate", "label": "Learning rate", "type": "number", "default": 5e-5},
            {"key": "quant_bits", "label": "Quantization bits", "type": "number", "default": 4},
        ],
    },
]


def _run_job(job_id: str, recipe_id: str, params: dict):
    """Run a NeMo AutoModel job in a background thread."""
    with _job_lock:
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["started_at"] = time.time()

    model = params.get("model", "")
    cmd = [
        "python", "-m", "nemo.automodel.train",
        f"--recipe={recipe_id}",
        f"--model={model}",
    ]

    for k, v in params.items():
        if k == "model":
            continue
        cmd.append(f"--{k}={v}")

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=86400,
        )
        with _job_lock:
            _jobs[job_id]["status"] = "complete" if proc.returncode == 0 else "failed"
            _jobs[job_id]["finished_at"] = time.time()
            _jobs[job_id]["exit_code"] = proc.returncode
            _jobs[job_id]["stdout"] = proc.stdout[-5000:] if proc.stdout else ""
            _jobs[job_id]["stderr"] = proc.stderr[-5000:] if proc.stderr else ""
    except subprocess.TimeoutExpired:
        with _job_lock:
            _jobs[job_id]["status"] = "timeout"
            _jobs[job_id]["finished_at"] = time.time()
    except Exception as e:
        with _job_lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["finished_at"] = time.time()
            _jobs[job_id]["stderr"] = str(e)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_status():
    return _check_installed()


@router.get("/recipes")
async def list_recipes():
    return RECIPES


@router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str):
    for r in RECIPES:
        if r["id"] == recipe_id:
            return r
    raise HTTPException(status_code=404, detail="Recipe not found")


class JobRequest(BaseModel):
    recipe_id: str
    params: dict


@router.post("/jobs")
async def create_job(req: JobRequest):
    recipe = None
    for r in RECIPES:
        if r["id"] == req.recipe_id:
            recipe = r
            break
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    job_id = f"{req.recipe_id}-{int(time.time())}"
    job = {
        "id": job_id,
        "recipe_id": req.recipe_id,
        "recipe_name": recipe["name"],
        "params": req.params,
        "status": "queued",
        "created_at": time.time(),
        "started_at": None,
        "finished_at": None,
    }

    with _job_lock:
        _jobs[job_id] = job

    thread = threading.Thread(target=_run_job, args=(job_id, req.recipe_id, req.params), daemon=True)
    thread.start()

    return job


@router.get("/jobs")
async def list_jobs():
    with _job_lock:
        jobs = sorted(_jobs.values(), key=lambda j: j["created_at"], reverse=True)
    return jobs


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    with _job_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
