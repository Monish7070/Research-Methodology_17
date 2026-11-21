"""Processing pipeline routes."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.serializers import detection_out, job_out, keyframe_out
from app.core.config import settings
from app.core.deps import get_current_user, require_permission
from app.database.db import get_db
from app.models.models import Detection, Keyframe, ProcessingJob, User, Video
from app.schemas.schemas import ProcessingStartRequest
from app.services import ai_service, pipeline

router = APIRouter(prefix="/processing", tags=["Processing"])


def _job_or_404(db: Session, job_id: int) -> ProcessingJob:
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Processing job not found")
    return job


@router.post("/start/{video_id}", status_code=202)
def start_processing(
    video_id: int,
    payload: ProcessingStartRequest | None = None,
    current_user: User = Depends(require_permission("processing:start")),
    db: Session = Depends(get_db),
):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if not Path(video.path).exists():
        raise HTTPException(status_code=410, detail="The uploaded file is no longer available on disk")

    running = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.video_id == video_id, ProcessingJob.status.in_(["queued", "running"]))
        .first()
    )
    if running:
        raise HTTPException(
            status_code=409,
            detail=f"A processing job (#{running.id}) is already active for this file",
        )

    weights = Path(settings.MODEL_WEIGHTS)
    if not weights.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Trained model not found at {weights}. Set YOLO_WEIGHTS in backend/.env.",
        )

    payload = payload or ProcessingStartRequest()
    job = ProcessingJob(
        video_id=video.id,
        status="queued",
        progress=0,
        stages=pipeline.initial_stages(),
        threshold=payload.threshold or settings.KEYFRAME_THRESHOLD,
        temporal_gap=payload.temporal_gap or settings.KEYFRAME_GAP,
        config={
            "threshold": payload.threshold or settings.KEYFRAME_THRESHOLD,
            "temporal_gap": payload.temporal_gap or settings.KEYFRAME_GAP,
            "conf_threshold": payload.conf_threshold or settings.CONF_THRESHOLD,
            "max_layercam": payload.max_layercam
            if payload.max_layercam is not None
            else settings.MAX_LAYERCAM_PER_JOB,
            "frame_stride": payload.frame_stride or settings.KEYFRAME_STRIDE,
            "image_size": payload.image_size or settings.IMAGE_SIZE,
            "cam_method": settings.CAM_METHOD,
            "weights": str(weights),
        },
        created_by_id=current_user.id,
    )
    video.status = "processing"
    db.add(job)
    db.commit()
    db.refresh(job)

    pipeline.start_job_async(job.id)
    return job_out(_job_or_404(db, job.id))


@router.get("/jobs")
def list_jobs(
    status_filter: str | None = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(ProcessingJob)
    if status_filter:
        query = query.filter(ProcessingJob.status == status_filter)
    total = query.count()
    jobs = query.order_by(ProcessingJob.created_at.desc()).offset(offset).limit(min(limit, 200)).all()
    return {"total": total, "items": [job_out(j) for j in jobs]}


@router.get("/{job_id}/status")
def job_status(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _job_or_404(db, job_id)
    db.refresh(job)
    data = job_out(job)
    data["is_running"] = pipeline.is_job_running(job.id)
    return data


@router.get("/{job_id}/results")
def job_results(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = _job_or_404(db, job_id)
    detections = (
        db.query(Detection).filter(Detection.job_id == job.id).order_by(Detection.confidence.desc()).all()
    )
    keyframes = db.query(Keyframe).filter(Keyframe.job_id == job.id).order_by(Keyframe.frame_index).all()

    breakdown: dict[str, int] = {}
    for detection in detections:
        breakdown[detection.class_name] = breakdown.get(detection.class_name, 0) + 1

    return {
        "job": job_out(job),
        "keyframes": [keyframe_out(k) for k in keyframes],
        "detections": [detection_out(d) for d in detections],
        "summary": {
            "frames_read": job.frames_read,
            "keyframes_saved": job.keyframes_saved,
            "reduction_percent": job.reduction_percent,
            "threshold": job.threshold,
            "temporal_gap": job.temporal_gap,
            "detections": len(detections),
            "breakdown": breakdown,
            "layercam_count": job.layercam_count,
            "high_priority": job.high_priority_count,
            "duration_seconds": job.duration_seconds,
        },
    }


@router.post("/{job_id}/cancel")
def cancel_job(
    job_id: int,
    current_user: User = Depends(require_permission("processing:start")),
    db: Session = Depends(get_db),
):
    job = _job_or_404(db, job_id)
    if job.status != "queued":
        raise HTTPException(status_code=409, detail="Only queued jobs can be cancelled")
    job.status = "failed"
    job.error_message = "Cancelled before processing started"
    db.commit()
    return {"message": "Job cancelled"}


@router.delete("/{job_id}")
def delete_job(
    job_id: int,
    current_user: User = Depends(require_permission("video:delete")),
    db: Session = Depends(get_db),
):
    job = _job_or_404(db, job_id)
    if pipeline.is_job_running(job.id):
        raise HTTPException(status_code=409, detail="Cannot delete a job that is currently running")

    from app.models.models import Report
    from app.services.storage import remove_tree

    db.query(Report).filter(Report.job_id == job.id).update({Report.job_id: None}, synchronize_session=False)
    db.query(Detection).filter(Detection.job_id == job.id).delete(synchronize_session=False)
    db.query(Keyframe).filter(Keyframe.job_id == job.id).delete(synchronize_session=False)
    db.delete(job)
    db.commit()

    remove_tree(settings.KEYFRAME_DIR / f"job_{job_id}")
    remove_tree(settings.DETECTION_DIR / f"job_{job_id}")
    remove_tree(settings.GRADCAM_DIR / f"job_{job_id}")
    return {"message": "Processing job deleted"}


@router.get("/{job_id}/model")
def job_model_info(
    job_id: int,
    current_user: User = Depends(get_current_user),
):
    _ = job_id
    return ai_service.model_status()
