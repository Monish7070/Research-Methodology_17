"""Verified location management for detections."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.serializers import detection_out, location_out
from app.core.deps import get_current_user, require_permission
from app.database.db import get_db
from app.models.models import Detection, Location, User
from app.schemas.schemas import LocationUpdateRequest
from app.services import priority_service

router = APIRouter(prefix="/locations", tags=["Locations"])


@router.get("")
def list_locations(
    verified: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Location)
    if verified is not None:
        query = query.filter(Location.verified.is_(verified))
    items = query.order_by(Location.created_at.desc()).limit(500).all()
    return {
        "total": len(items),
        "items": [
            {
                **location_out(location),
                "detection": detection_out(location.detection, include_images=False),
            }
            for location in items
        ],
    }


@router.put("/{detection_id}")
def set_location(
    detection_id: int,
    payload: LocationUpdateRequest,
    current_user: User = Depends(require_permission("location:edit")),
    db: Session = Depends(get_db),
):
    detection = db.get(Detection, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")

    location = db.query(Location).filter(Location.detection_id == detection_id).first()
    if location is None:
        location = Location(detection_id=detection_id, source="manual", created_by_id=current_user.id)
        db.add(location)

    location.latitude = payload.latitude
    location.longitude = payload.longitude
    location.label = payload.label
    location.road_name = payload.road_name
    location.verified = payload.verified
    location.created_by_id = location.created_by_id or current_user.id
    db.commit()
    db.refresh(location)

    priority_service.recalculate(db, [detection])
    db.refresh(detection)

    return {
        "message": "Location saved" + (" and marked verified" if payload.verified else ""),
        "location": location_out(location),
        "detection": detection_out(detection),
    }


@router.delete("/{detection_id}")
def delete_location(
    detection_id: int,
    current_user: User = Depends(require_permission("location:edit")),
    db: Session = Depends(get_db),
):
    location = db.query(Location).filter(Location.detection_id == detection_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="No location recorded for this detection")
    db.delete(location)
    db.commit()
    detection = db.get(Detection, detection_id)
    if detection:
        priority_service.recalculate(db, [detection])
    return {"message": "Location removed"}
