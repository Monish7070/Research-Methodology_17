"""System settings routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.serializers import user_out
from app.core.config import settings as app_settings
from app.core.deps import get_current_user, require_permission
from app.database.db import get_db
from app.models.models import SystemSetting, User
from app.schemas.schemas import SettingUpdateRequest
from app.services import ai_service

router = APIRouter(prefix="/settings", tags=["Settings"])

ALLOWED_KEYS = {"priority_config", "organisation"}


@router.get("")
def get_settings(
    current_user: User = Depends(require_permission("settings:manage")),
    db: Session = Depends(get_db),
):
    rows = db.query(SystemSetting).all()
    return {
        "priority_config": ai_service.get_priority_config(db),
        "settings": [
            {
                "key": row.key,
                "value": row.value,
                "description": row.description,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                "updated_by": row.updated_by.name if row.updated_by else None,
            }
            for row in rows
        ],
        "environment": {
            "model_weights": str(app_settings.MODEL_WEIGHTS),
            "model_exists": app_settings.MODEL_WEIGHTS.exists(),
            "cam_method": app_settings.CAM_METHOD,
            "image_size": app_settings.IMAGE_SIZE,
            "conf_threshold": app_settings.CONF_THRESHOLD,
            "keyframe_threshold": app_settings.KEYFRAME_THRESHOLD,
            "keyframe_gap": app_settings.KEYFRAME_GAP,
            "max_layercam_per_job": app_settings.MAX_LAYERCAM_PER_JOB,
            "max_upload_mb": app_settings.MAX_UPLOAD_MB,
            "database_url": app_settings.DATABASE_URL.split("///")[0] + "///" + "...",
        },
    }


@router.put("")
def update_setting(
    payload: SettingUpdateRequest,
    current_user: User = Depends(require_permission("settings:manage")),
    db: Session = Depends(get_db),
):
    if payload.key not in ALLOWED_KEYS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported setting '{payload.key}'. Allowed: {', '.join(sorted(ALLOWED_KEYS))}",
        )

    value = payload.value
    if payload.key == "priority_config":
        if not isinstance(value, dict):
            raise HTTPException(status_code=422, detail="priority_config must be an object")
        try:
            value = ai_service.validate_priority_config(value)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    row = db.query(SystemSetting).filter(SystemSetting.key == payload.key).first()
    if row is None:
        row = SystemSetting(key=payload.key, value=value)
        db.add(row)
    else:
        row.value = value
    row.updated_by_id = current_user.id
    db.commit()
    return {"message": "Setting saved", "key": payload.key, "value": value}


@router.get("/profile")
def profile(current_user: User = Depends(get_current_user)):
    return user_out(current_user)
