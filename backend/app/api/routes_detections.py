"""Detection routes with filtering, search and sorting."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.serializers import detection_out, history_out, task_out
from app.core.deps import get_current_user
from app.database.db import get_db
from app.models.models import Detection, PriorityScore, User

router = APIRouter(prefix="/detections", tags=["Detections"])

SORT_FIELDS = {
    "confidence": Detection.confidence,
    "created_at": Detection.created_at,
    "class_name": Detection.class_name,
    "priority": PriorityScore.total_score,
}


@router.get("")
def list_detections(
    class_name: str | None = Query(default=None, description="crack | garbage | pothole"),
    job_id: int | None = None,
    min_confidence: float | None = Query(default=None, ge=0, le=1),
    max_confidence: float | None = Query(default=None, ge=0, le=1),
    search: str | None = None,
    priority: str | None = Query(default=None, pattern="^(low|medium|high)$"),
    status: str | None = None,
    has_explanation: bool | None = None,
    sort_by: str = Query(default="confidence", pattern="^(confidence|created_at|class_name|priority)$"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Detection)

    if class_name and class_name != "all":
        query = query.filter(Detection.class_name == class_name)
    if job_id:
        query = query.filter(Detection.job_id == job_id)
    if min_confidence is not None:
        query = query.filter(Detection.confidence >= min_confidence)
    if max_confidence is not None:
        query = query.filter(Detection.confidence <= max_confidence)
    if search:
        needle = f"%{search.strip()}%"
        query = query.filter(or_(Detection.frame_name.ilike(needle), Detection.class_name.ilike(needle)))
    if status and status != "all":
        query = query.filter(Detection.maintenance_status == status)
    if has_explanation is not None:
        if has_explanation:
            query = query.filter(Detection.explanation.has())
        else:
            query = query.filter(~Detection.explanation.has())
    if priority:
        query = query.join(PriorityScore, PriorityScore.detection_id == Detection.id).filter(
            PriorityScore.category == priority
        )

    total = query.count()

    column = SORT_FIELDS.get(sort_by, Detection.confidence)
    if sort_by == "priority" and not priority:
        query = query.outerjoin(PriorityScore, PriorityScore.detection_id == Detection.id)
    query = query.order_by(column.desc() if sort_dir == "desc" else column.asc())
    detections = query.offset(offset).limit(limit).all()

    counts_rows = (
        db.query(Detection.class_name, Detection.id).all()
    )
    counts: dict[str, int] = {}
    for name, _ in counts_rows:
        counts[name] = counts.get(name, 0) + 1

    return {
        "total": total,
        "counts": {
            "crack": counts.get("crack", 0),
            "garbage": counts.get("garbage", 0),
            "pothole": counts.get("pothole", 0),
            "all": sum(counts.values()),
        },
        "items": [detection_out(d) for d in detections],
    }


@router.get("/{detection_id}")
def get_detection(
    detection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    detection = db.get(Detection, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    data = detection_out(detection)
    data["tasks"] = [task_out(t) for t in detection.tasks]
    data["history"] = [history_out(h) for h in detection.history]
    data["processing"] = {
        "job_id": detection.job_id,
        "frames_read": detection.job.frames_read if detection.job else None,
        "keyframes_saved": detection.job.keyframes_saved if detection.job else None,
        "reduction_percent": detection.job.reduction_percent if detection.job else None,
        "video": detection.job.video.original_filename if detection.job and detection.job.video else None,
    }
    return data
