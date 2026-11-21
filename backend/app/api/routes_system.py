"""System health, model status and environment information."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func

from app.core.config import settings
from app.core.deps import get_current_user
from app.database.db import SessionLocal
from app.models.models import Detection, ProcessingJob, User, Video
from app.services import ai_service

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}


@router.get("/status")
def status(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        counts = {
            "users": db.query(func.count(User.id)).scalar() or 0,
            "videos": db.query(func.count(Video.id)).scalar() or 0,
            "jobs": db.query(func.count(ProcessingJob.id)).scalar() or 0,
            "detections": db.query(func.count(Detection.id)).scalar() or 0,
        }
    finally:
        db.close()

    weights = Path(settings.MODEL_WEIGHTS)
    return {
        "app": {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "api_prefix": settings.API_PREFIX,
            "database": settings.DATABASE_URL.split("///")[0],
        },
        "model": ai_service.model_status(),
        "pipeline": {
            "keyframe_threshold": settings.KEYFRAME_THRESHOLD,
            "temporal_gap": settings.KEYFRAME_GAP,
            "image_size": settings.IMAGE_SIZE,
            "conf_threshold": settings.CONF_THRESHOLD,
            "cam_method": settings.CAM_METHOD,
            "max_layercam_per_job": settings.MAX_LAYERCAM_PER_JOB,
        },
        "storage": {
            "uploads": str(settings.UPLOAD_DIR),
            "outputs": str(settings.OUTPUT_DIR),
            "reports": str(settings.REPORT_DIR),
            "model_weights": str(weights),
            "model_present": weights.exists(),
        },
        "counts": counts,
    }
