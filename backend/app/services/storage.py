"""Shared helpers for media paths, URLs and file storage."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from app.core.config import BACKEND_DIR, settings


def media_url(path: str | Path | None) -> str | None:
    """Convert an absolute stored path into a /media/... URL served by FastAPI."""
    if not path:
        return None
    p = Path(path)
    try:
        relative = p.resolve().relative_to(BACKEND_DIR.resolve())
    except ValueError:
        return None
    parts = [part for part in relative.as_posix().split("/") if part]
    if not parts:
        return None
    return "/media/" + "/".join(parts)


def safe_name(name: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]", "_", Path(name).name)
    return stem[:180] or "file"


def human_size(num_bytes: int) -> str:
    size = float(num_bytes or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size:.1f} GB"


def remove_tree(path: str | Path | None) -> None:
    if not path:
        return
    p = Path(path)
    if p.is_dir():
        shutil.rmtree(p, ignore_errors=True)
    elif p.exists():
        try:
            p.unlink()
        except OSError:
            pass


def relative_to_backend(path: str | Path | None) -> str | None:
    if not path:
        return None
    try:
        return Path(path).resolve().relative_to(BACKEND_DIR.resolve()).as_posix()
    except ValueError:
        return None


def ensure_job_dirs(job_id: int) -> dict[str, Path]:
    keyframes = settings.KEYFRAME_DIR / f"job_{job_id}"
    detections = settings.DETECTION_DIR / f"job_{job_id}"
    gradcam = settings.GRADCAM_DIR / f"job_{job_id}"
    for directory in (keyframes, detections, gradcam):
        directory.mkdir(parents=True, exist_ok=True)
    return {"keyframes": keyframes, "detections": detections, "gradcam": gradcam}
