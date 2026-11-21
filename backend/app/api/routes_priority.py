"""Maintenance priority routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.serializers import detection_out, priority_out
from app.core.deps import get_current_user, require_permission
from app.database.db import get_db
from app.models.models import Detection, PriorityScore, SystemSetting, User
from app.schemas.schemas import PriorityConfigRequest, PriorityRecalculateRequest
from app.services import ai_service, priority_service

router = APIRouter(prefix="/priority", tags=["Priority"])


@router.get("")
def list_priorities(
    category: str | None = Query(default=None, pattern="^(low|medium|high)$"),
    class_name: str | None = None,
    job_id: int | None = None,
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    limit: int = Query(default=100, ge=1, le=300),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(PriorityScore).join(Detection, Detection.id == PriorityScore.detection_id)
    if category:
        query = query.filter(PriorityScore.category == category)
    if class_name and class_name != "all":
        query = query.filter(Detection.class_name == class_name)
    if job_id:
        query = query.filter(Detection.job_id == job_id)

    total = query.count()
    query = query.order_by(
        PriorityScore.total_score.desc() if sort_dir == "desc" else PriorityScore.total_score.asc()
    )
    scores = query.offset(offset).limit(limit).all()

    distribution_rows = (
        db.query(PriorityScore.category, PriorityScore.id).all()
    )
    distribution = {"low": 0, "medium": 0, "high": 0}
    for name, _ in distribution_rows:
        distribution[name] = distribution.get(name, 0) + 1

    return {
        "total": total,
        "distribution": distribution,
        "config": ai_service.get_priority_config(db),
        "items": [
            {
                **priority_out(score),
                "detection": detection_out(score.detection, include_images=False),
            }
            for score in scores
        ],
    }


@router.get("/settings")
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {"config": ai_service.get_priority_config(db)}


@router.put("/settings")
def update_settings(
    payload: PriorityConfigRequest,
    current_user: User = Depends(require_permission("priority:configure")),
    db: Session = Depends(get_db),
):
    try:
        cleaned = ai_service.validate_priority_config(payload.model_dump())
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    setting = db.query(SystemSetting).filter(SystemSetting.key == "priority_config").first()
    if setting is None:
        setting = SystemSetting(key="priority_config", value=cleaned, description="Weighted priority scoring rules")
        db.add(setting)
    else:
        setting.value = cleaned
        setting.updated_by_id = current_user.id
    db.commit()

    result = priority_service.recalculate(db)
    return {
        "message": f"Priority configuration saved and {result['updated']} scores recalculated",
        "config": ai_service.get_priority_config(db),
        "recalculated": result,
    }


@router.post("/recalculate")
def recalculate(
    payload: PriorityRecalculateRequest | None = None,
    current_user: User = Depends(require_permission("priority:configure")),
    db: Session = Depends(get_db),
):
    query = db.query(Detection)
    if payload and payload.job_id:
        query = query.filter(Detection.job_id == payload.job_id)
    result = priority_service.recalculate(db, query.all())
    return {"message": f"Recalculated {result['updated']} priority scores", **result}


@router.get("/{detection_id}")
def get_priority(
    detection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    detection = db.get(Detection, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    score = db.query(PriorityScore).filter(PriorityScore.detection_id == detection_id).first()
    if not score:
        raise HTTPException(status_code=404, detail="No priority score stored for this detection")
    return {
        "priority": priority_out(score),
        "detection": detection_out(detection),
        "config": ai_service.get_priority_config(db),
    }
