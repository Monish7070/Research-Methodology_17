"""Keyframe routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.serializers import detection_out, job_out, keyframe_out
from app.core.deps import get_current_user
from app.database.db import get_db
from app.models.models import Keyframe, ProcessingJob, User

router = APIRouter(prefix="/keyframes", tags=["Keyframes"])


@router.get("/job/{job_id}")
def list_job_keyframes(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Processing job not found")
    keyframes = (
        db.query(Keyframe).filter(Keyframe.job_id == job_id).order_by(Keyframe.frame_index).all()
    )
    return {
        "job": job_out(job),
        "extraction": {
            "frames_read": job.frames_read,
            "keyframes_saved": job.keyframes_saved,
            "frames_removed": max(0, (job.frames_read or 0) - (job.keyframes_saved or 0)),
            "reduction_percent": job.reduction_percent,
            "threshold": job.threshold,
            "temporal_gap": job.temporal_gap,
        },
        "items": [keyframe_out(k) for k in keyframes],
    }


# Kept for the documented endpoint shape (GET /api/keyframes/{job_id}).
@router.get("/{job_id}")
def list_keyframes_alias(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_job_keyframes(job_id, current_user, db)


@router.get("/single/{keyframe_id}")
def get_keyframe(
    keyframe_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    keyframe = db.get(Keyframe, keyframe_id)
    if not keyframe:
        raise HTTPException(status_code=404, detail="Keyframe not found")
    data = keyframe_out(keyframe)
    data["detections"] = [detection_out(d) for d in keyframe.detections]
    return data
