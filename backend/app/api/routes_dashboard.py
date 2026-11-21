"""Dashboard summary and analytics, computed only from stored data."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.serializers import detection_out, history_out, job_out, video_out
from app.core.config import MAINTENANCE_STATUSES, STATUS_LABELS, settings
from app.core.deps import get_current_user
from app.database.db import get_db
from app.models.models import (
    Detection,
    Keyframe,
    MaintenanceTask,
    PriorityScore,
    ProcessingJob,
    StatusHistory,
    User,
    Video,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

PENDING_STATUSES = ["newly_detected", "pending_review", "approved", "assigned", "in_progress"]


@router.get("/summary")
def summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total_videos = db.query(func.count(Video.id)).scalar() or 0
    videos_processed = (
        db.query(func.count(Video.id)).filter(Video.status == "processed").scalar() or 0
    )
    total_jobs = db.query(func.count(ProcessingJob.id)).scalar() or 0
    total_keyframes = db.query(func.count(Keyframe.id)).scalar() or 0

    class_counts = dict(
        db.query(Detection.class_name, func.count(Detection.id))
        .group_by(Detection.class_name)
        .all()
    )
    total_detections = sum(class_counts.values())

    high_priority = (
        db.query(func.count(PriorityScore.id)).filter(PriorityScore.category == "high").scalar() or 0
    )
    medium_priority = (
        db.query(func.count(PriorityScore.id)).filter(PriorityScore.category == "medium").scalar() or 0
    )
    low_priority = (
        db.query(func.count(PriorityScore.id)).filter(PriorityScore.category == "low").scalar() or 0
    )

    pending = (
        db.query(func.count(Detection.id))
        .filter(Detection.maintenance_status.in_(PENDING_STATUSES))
        .scalar()
        or 0
    )
    completed = (
        db.query(func.count(Detection.id))
        .filter(Detection.maintenance_status == "resolved")
        .scalar()
        or 0
    )
    rejected = (
        db.query(func.count(Detection.id))
        .filter(Detection.maintenance_status == "rejected")
        .scalar()
        or 0
    )
    open_tasks = (
        db.query(func.count(MaintenanceTask.id))
        .filter(MaintenanceTask.status.in_(["pending_review", "approved", "assigned", "in_progress"]))
        .scalar()
        or 0
    )
    explained = (
        db.query(func.count(Detection.id)).filter(Detection.explanation.has()).scalar() or 0
    )

    return {
        "cards": {
            "total_videos": total_videos,
            "videos_processed": videos_processed,
            "processing_jobs": total_jobs,
            "total_keyframes": total_keyframes,
            "total_defects": total_detections,
            "cracks": class_counts.get("crack", 0),
            "garbage": class_counts.get("garbage", 0),
            "potholes": class_counts.get("pothole", 0),
            "high_priority": high_priority,
            "medium_priority": medium_priority,
            "low_priority": low_priority,
            "pending_maintenance": pending,
            "completed_maintenance": completed,
            "rejected": rejected,
            "open_tasks": open_tasks,
            "explained_detections": explained,
        },
        "model": {
            "weights": str(settings.MODEL_WEIGHTS),
            "available": settings.MODEL_WEIGHTS.exists(),
            "classes": ["crack", "garbage", "pothole"],
            "cam_method": settings.CAM_METHOD,
        },
    }


@router.get("/analytics")
def analytics(days: int = 30, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=max(1, min(days, 365)))

    category_rows = (
        db.query(Detection.class_name, func.count(Detection.id))
        .group_by(Detection.class_name)
        .all()
    )
    defects_by_category = [
        {"name": name.title(), "key": name, "value": count} for name, count in sorted(category_rows)
    ]

    # Detections over time (by class) for the window.
    recent = (
        db.query(Detection)
        .filter(Detection.created_at >= window_start)
        .order_by(Detection.created_at)
        .all()
    )
    daily: dict[str, dict] = {}
    for offset in range((now.date() - window_start.date()).days + 1):
        day = (window_start.date() + timedelta(days=offset)).isoformat()
        daily[day] = {"date": day, "crack": 0, "garbage": 0, "pothole": 0, "total": 0}
    score_by_day: dict[str, list[float]] = defaultdict(list)

    for detection in recent:
        if not detection.created_at:
            continue
        day = detection.created_at.date().isoformat()
        bucket = daily.setdefault(day, {"date": day, "crack": 0, "garbage": 0, "pothole": 0, "total": 0})
        if detection.class_name in bucket:
            bucket[detection.class_name] += 1
        bucket["total"] += 1
        if detection.priority:
            score_by_day[day].append(detection.priority.total_score)

    defects_over_time = sorted(daily.values(), key=lambda item: item["date"])
    condition_trend = [
        {
            "date": day,
            "average_priority": round(sum(values) / len(values), 2),
            "defects": len(values),
        }
        for day, values in sorted(score_by_day.items())
    ]

    priority_rows = (
        db.query(PriorityScore.category, func.count(PriorityScore.id))
        .group_by(PriorityScore.category)
        .all()
    )
    counts = {name: count for name, count in priority_rows}
    priority_distribution = [
        {"name": "High", "key": "high", "value": counts.get("high", 0)},
        {"name": "Medium", "key": "medium", "value": counts.get("medium", 0)},
        {"name": "Low", "key": "low", "value": counts.get("low", 0)},
    ]

    confidence_rows = (
        db.query(Detection.confidence).filter(Detection.created_at >= window_start).all()
    )
    buckets = [
        (0.0, 0.4, "0.00 - 0.40"),
        (0.4, 0.55, "0.40 - 0.55"),
        (0.55, 0.70, "0.55 - 0.70"),
        (0.70, 0.85, "0.70 - 0.85"),
        (0.85, 1.01, "0.85 - 1.00"),
    ]
    confidence_distribution = [
        {
            "range": label,
            "value": sum(1 for (value,) in confidence_rows if low <= value < high),
        }
        for low, high, label in buckets
    ]

    monthly_start = now - timedelta(days=182)
    monthly_rows = (
        db.query(Detection)
        .filter(Detection.created_at >= monthly_start)
        .all()
    )
    monthly: dict[str, dict] = {}
    for detection in monthly_rows:
        key = detection.created_at.strftime("%Y-%m")
        entry = monthly.setdefault(key, {"month": key, "total": 0, "high": 0, "medium": 0, "low": 0})
        entry["total"] += 1
        if detection.priority:
            entry[detection.priority.category] = entry.get(detection.priority.category, 0) + 1
    monthly_stats = sorted(monthly.values(), key=lambda item: item["month"])

    status_rows = (
        db.query(Detection.maintenance_status, func.count(Detection.id))
        .group_by(Detection.maintenance_status)
        .all()
    )
    status_counts = dict(status_rows)
    maintenance_status = [
        {
            "key": key,
            "name": STATUS_LABELS[key],
            "value": status_counts.get(key, 0),
        }
        for key in MAINTENANCE_STATUSES
    ]

    latest_scores = (
        db.query(func.avg(PriorityScore.total_score)).scalar()
    )
    return {
        "window_days": days,
        "defects_by_category": defects_by_category,
        "defects_over_time": defects_over_time,
        "priority_distribution": priority_distribution,
        "road_condition_trend": condition_trend,
        "confidence_distribution": confidence_distribution,
        "monthly_stats": monthly_stats,
        "maintenance_status": maintenance_status,
        "average_priority": round(float(latest_scores), 2) if latest_scores else 0.0,
    }


@router.get("/recent")
def recent_activity(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    videos = db.query(Video).order_by(Video.uploaded_at.desc()).limit(6).all()
    detections = (
        db.query(Detection).order_by(Detection.created_at.desc()).limit(8).all()
    )
    high = (
        db.query(Detection)
        .join(PriorityScore, PriorityScore.detection_id == Detection.id)
        .filter(PriorityScore.category == "high")
        .order_by(PriorityScore.total_score.desc(), Detection.created_at.desc())
        .limit(6)
        .all()
    )
    jobs = db.query(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(6).all()
    updates = (
        db.query(StatusHistory).order_by(StatusHistory.created_at.desc()).limit(8).all()
    )

    return {
        "recent_videos": [video_out(v) for v in videos],
        "recent_detections": [detection_out(d, include_images=False) for d in detections],
        "high_priority": [detection_out(d, include_images=False) for d in high],
        "recent_jobs": [job_out(j, include_video=False) for j in jobs],
        "recent_updates": [history_out(h) for h in updates],
    }
