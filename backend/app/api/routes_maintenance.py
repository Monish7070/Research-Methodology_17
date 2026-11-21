"""Defect review, assignment and maintenance tracking routes."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.serializers import detection_out, history_out, task_out, user_out
from app.core.config import MAINTENANCE_STATUSES, ROLE_ADMIN, ROLE_INSPECTOR, ROLE_OFFICER
from app.core.deps import get_current_user, permissions_of, require_permission
from app.database.db import get_db
from app.models.models import Detection, MaintenanceTask, PriorityScore, StatusHistory, User
from app.schemas.schemas import (
    DefectStatusRequest,
    MaintenanceCreateRequest,
    MaintenanceUpdateRequest,
)

router = APIRouter(tags=["Maintenance"])

ALLOWED_TRANSITIONS = {
    "newly_detected": {"pending_review", "approved", "rejected"},
    "pending_review": {"approved", "rejected"},
    "approved": {"assigned", "rejected"},
    "assigned": {"in_progress", "rejected"},
    "in_progress": {"resolved", "assigned"},
    "resolved": set(),
    "rejected": set(),
}


def _require_status(status: str) -> None:
    if status not in MAINTENANCE_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unknown maintenance status '{status}'")


def _set_detection_status(
    db: Session,
    detection: Detection,
    new_status: str,
    user: User,
    comment: str = "",
    task: MaintenanceTask | None = None,
) -> None:
    _require_status(new_status)
    previous = detection.maintenance_status
    if previous == new_status and task is None:
        return
    detection.maintenance_status = new_status
    db.add(
        StatusHistory(
            detection_id=detection.id,
            task_id=task.id if task else None,
            from_status=previous,
            to_status=new_status,
            changed_by_id=user.id,
            comment=comment,
        )
    )


@router.get("/maintenance")
def list_tasks(
    status: str | None = None,
    assigned_to_id: int | None = None,
    priority: str | None = Query(default=None, pattern="^(low|medium|high)$"),
    class_name: str | None = None,
    limit: int = Query(default=100, ge=1, le=300),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(MaintenanceTask)
    if status and status != "all":
        query = query.filter(MaintenanceTask.status == status)
    if assigned_to_id:
        query = query.filter(MaintenanceTask.assigned_to_id == assigned_to_id)
    if priority or class_name:
        query = query.join(Detection, Detection.id == MaintenanceTask.detection_id)
        if class_name and class_name != "all":
            query = query.filter(Detection.class_name == class_name)
        if priority:
            query = query.join(PriorityScore, PriorityScore.detection_id == Detection.id).filter(
                PriorityScore.category == priority
            )

    total = query.count()
    tasks = query.order_by(MaintenanceTask.updated_at.desc()).offset(offset).limit(limit).all()

    status_rows = db.query(MaintenanceTask.status, MaintenanceTask.id).all()
    counts: dict[str, int] = {name: 0 for name in MAINTENANCE_STATUSES}
    for name, _ in status_rows:
        counts[name] = counts.get(name, 0) + 1

    return {
        "total": total,
        "counts": counts,
        "items": [
            {
                **task_out(task),
                "detection": detection_out(task.detection, include_images=False),
            }
            for task in tasks
        ],
    }


@router.get("/maintenance/assignees")
def assignees(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .filter(User.is_active.is_(True))
        .order_by(User.name)
        .all()
    )
    return {"items": [user_out(u) for u in users]}


@router.post("/maintenance", status_code=201)
def create_task(
    payload: MaintenanceCreateRequest,
    current_user: User = Depends(require_permission("defect:assign")),
    db: Session = Depends(get_db),
):
    detection = db.get(Detection, payload.detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")

    _require_status(payload.status)
    if payload.assigned_to_id:
        assignee = db.get(User, payload.assigned_to_id)
        if not assignee or not assignee.is_active:
            raise HTTPException(status_code=422, detail="Selected assignee is not an active user")

    task = MaintenanceTask(
        detection_id=detection.id,
        title=payload.title or f"{detection.class_name.title()} - {detection.frame_name}",
        assigned_to_id=payload.assigned_to_id,
        status=payload.status,
        notes=payload.notes,
        created_by_id=current_user.id,
    )
    db.add(task)
    db.flush()
    _set_detection_status(
        db,
        detection,
        payload.status,
        current_user,
        comment=payload.notes or "Maintenance task created",
        task=task,
    )
    db.commit()
    db.refresh(task)
    return {**task_out(task), "detection": detection_out(detection, include_images=False)}


@router.put("/maintenance/{task_id}")
def update_task(
    task_id: int,
    payload: MaintenanceUpdateRequest,
    current_user: User = Depends(require_permission("defect:update")),
    db: Session = Depends(get_db),
):
    task = db.get(MaintenanceTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Maintenance task not found")

    detection = task.detection
    can_assign = "defect:assign" in permissions_of(current_user)

    if payload.status:
        _require_status(payload.status)
        if payload.status != task.status:
            allowed = ALLOWED_TRANSITIONS.get(task.status, set())
            if payload.status not in allowed and current_user.role.name != ROLE_ADMIN:
                raise HTTPException(
                    status_code=409,
                    detail=f"Cannot move a task from '{task.status}' to '{payload.status}'",
                )
            task.status = payload.status
            _set_detection_status(
                db,
                detection,
                payload.status,
                current_user,
                comment=payload.comment or f"Status updated to {payload.status}",
                task=task,
            )

    if payload.assigned_to_id is not None:
        if not can_assign:
            raise HTTPException(status_code=403, detail="Only officers and administrators can assign work")
        if payload.assigned_to_id:
            assignee = db.get(User, payload.assigned_to_id)
            if not assignee or not assignee.is_active:
                raise HTTPException(status_code=422, detail="Selected assignee is not an active user")
        task.assigned_to_id = payload.assigned_to_id or None
        if payload.assigned_to_id and task.status in {"pending_review", "approved"}:
            task.status = "assigned"
            _set_detection_status(
                db,
                detection,
                "assigned",
                current_user,
                comment="Maintenance work assigned",
                task=task,
            )

    if payload.notes is not None:
        task.notes = payload.notes
        db.add(
            StatusHistory(
                detection_id=detection.id,
                task_id=task.id,
                from_status=task.status,
                to_status=task.status,
                changed_by_id=current_user.id,
                comment=f"Note added: {payload.notes[:400]}",
            )
        )

    if payload.resolution_notes is not None:
        task.resolution_notes = payload.resolution_notes

    if payload.due_date is not None:
        task.due_date = payload.due_date

    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    return {**task_out(task), "detection": detection_out(detection, include_images=False)}


@router.post("/maintenance/comment/{detection_id}")
def add_comment(
    detection_id: int,
    payload: dict,
    current_user: User = Depends(require_permission("defect:update")),
    db: Session = Depends(get_db),
):
    detection = db.get(Detection, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    comment = str(payload.get("comment", "")).strip()
    if not comment:
        raise HTTPException(status_code=422, detail="Comment cannot be empty")

    task = detection.tasks[0] if detection.tasks else None
    entry = StatusHistory(
        detection_id=detection.id,
        task_id=task.id if task else None,
        from_status=detection.maintenance_status,
        to_status=detection.maintenance_status,
        changed_by_id=current_user.id,
        comment=comment[:2000],
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"message": "Comment added", "history": history_out(entry)}


@router.get("/maintenance/history/{task_id}")
def task_history(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(MaintenanceTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Maintenance task not found")
    return {
        "task": task_out(task),
        "history": [history_out(entry) for entry in task.history],
    }


@router.get("/maintenance/history")
def all_history(
    limit: int = Query(default=100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = db.query(StatusHistory).order_by(StatusHistory.created_at.desc()).limit(limit).all()
    return {"total": len(entries), "items": [history_out(e) for e in entries]}


@router.put("/defects/{detection_id}/status")
def update_defect_status(
    detection_id: int,
    payload: DefectStatusRequest,
    current_user: User = Depends(require_permission("defect:review")),
    db: Session = Depends(get_db),
):
    detection = db.get(Detection, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    _require_status(payload.status)

    if current_user.role.name == ROLE_INSPECTOR:
        raise HTTPException(status_code=403, detail="Field inspectors cannot approve or reject defects")

    _set_detection_status(db, detection, payload.status, current_user, payload.comment)

    for task in detection.tasks:
        if task.status != payload.status and payload.status in {
            "approved",
            "rejected",
            "assigned",
            "in_progress",
            "resolved",
        }:
            task.status = payload.status
            task.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(detection)
    return detection_out(detection)


@router.get("/defects")
def list_defects(
    status: str | None = None,
    priority: str | None = Query(default=None, pattern="^(low|medium|high)$"),
    class_name: str | None = None,
    limit: int = Query(default=100, ge=1, le=300),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Detection)
    if status and status != "all":
        query = query.filter(Detection.maintenance_status == status)
    if class_name and class_name != "all":
        query = query.filter(Detection.class_name == class_name)
    if priority:
        query = query.join(PriorityScore, PriorityScore.detection_id == Detection.id).filter(
            PriorityScore.category == priority
        )

    total = query.count()
    detections = query.order_by(Detection.created_at.desc()).offset(offset).limit(limit).all()

    counts: dict[str, int] = {name: 0 for name in MAINTENANCE_STATUSES}
    for status_name, _ in db.query(Detection.maintenance_status, Detection.id).all():
        counts[status_name] = counts.get(status_name, 0) + 1

    return {
        "total": total,
        "counts": counts,
        "items": [detection_out(d) for d in detections],
    }
