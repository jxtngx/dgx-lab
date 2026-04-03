from __future__ import annotations

import shutil
import subprocess
import time
from collections import deque

from fastapi import APIRouter

from app import config

router = APIRouter()

_history: deque[dict] = deque(maxlen=600)


def _run_smi(args: list[str]) -> str | None:
    smi = shutil.which("nvidia-smi")
    if not smi:
        return None
    try:
        proc = subprocess.run(
            [smi, *args],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if proc.returncode == 0:
            return proc.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def _parse_gpu_metrics() -> dict | None:
    raw = _run_smi([
        "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,utilization.memory",
        "--format=csv,noheader,nounits",
    ])
    if not raw:
        return None

    parts = [p.strip() for p in raw.split(",")]
    if len(parts) < 7:
        return None

    def _float(val: str) -> float | None:
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    gpu_util = _float(parts[1])
    mem_used_mib = _float(parts[2])
    mem_total_mib = _float(parts[3])
    temperature = _float(parts[4])
    power_draw = _float(parts[5])
    power_limit = _float(parts[6])
    mem_bw_pct = _float(parts[7]) if len(parts) > 7 else None

    # GB10 reports unified memory via /proc, not nvidia-smi
    if mem_total_mib is None:
        try:
            import psutil
            mem = psutil.virtual_memory()
            mem_total_mib = mem.total / (1024 ** 2)
            mem_used_mib = mem.used / (1024 ** 2)
        except Exception:
            pass

    return {
        "gpu_name": parts[0],
        "gpu_util": gpu_util or 0,
        "memory_used_gb": round(mem_used_mib / 1024, 1) if mem_used_mib is not None else None,
        "memory_total_gb": round(mem_total_mib / 1024, 1) if mem_total_mib is not None else config.MEMORY_TOTAL_GB,
        "temperature_c": temperature,
        "power_draw_w": round(power_draw, 1) if power_draw is not None else None,
        "power_limit_w": round(power_limit, 1) if power_limit is not None else None,
        "memory_bandwidth_pct": mem_bw_pct,
        "memory_bandwidth_gbs": round(mem_bw_pct * config.MEMORY_BANDWIDTH_MAX_GBS / 100, 1) if mem_bw_pct is not None else None,
        "memory_bandwidth_max_gbs": config.MEMORY_BANDWIDTH_MAX_GBS,
    }


def _parse_processes() -> list[dict]:
    raw = _run_smi([
        "--query-compute-apps=pid,process_name,used_gpu_memory",
        "--format=csv,noheader,nounits",
    ])
    if not raw or "no running" in raw.lower():
        return []

    processes = []
    for line in raw.strip().split("\n"):
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 3:
            try:
                processes.append({
                    "pid": int(parts[0]),
                    "name": parts[1],
                    "memory_mib": float(parts[2]),
                    "memory_gb": round(float(parts[2]) / 1024, 2),
                })
            except (ValueError, IndexError):
                continue
    return processes


@router.get("/status")
async def get_status():
    metrics = _parse_gpu_metrics()
    if not metrics:
        return {"available": False}

    snapshot = {**metrics, "timestamp": time.time()}
    _history.append(snapshot)
    return {"available": True, **snapshot}


@router.get("/processes")
async def get_processes():
    return _parse_processes()


@router.get("/timeline")
async def get_timeline():
    return list(_history)


@router.get("/system")
async def get_system_info():
    raw = _run_smi(["--query-gpu=name,driver_version,vbios_version,serial", "--format=csv,noheader"])
    import platform
    import socket

    info: dict = {
        "hostname": socket.gethostname(),
        "os_version": f"{platform.system()} {platform.release()}",
        "memory_total_gb": config.MEMORY_TOTAL_GB,
        "memory_bandwidth_max_gbs": config.MEMORY_BANDWIDTH_MAX_GBS,
    }
    if raw:
        parts = [p.strip() for p in raw.split(",")]
        info["gpu_name"] = parts[0] if len(parts) > 0 else None
        info["driver_version"] = parts[1] if len(parts) > 1 else None

    import psutil

    info["uptime_s"] = time.time() - psutil.boot_time()
    disk = psutil.disk_usage("/")
    info["disk_used_gb"] = round(disk.used / (1024**3), 1)
    info["disk_total_gb"] = round(disk.total / (1024**3), 1)

    return info
