"""Priority scoring recalculation helpers."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.models import Detection, Location, PriorityScore
from app.services import ai_service


def recalculate(db: Session, detections: list[Detection] | None = None) -> dict:
    config = ai_service.get_priority_config(db)
    if detections is None:
        detections = db.query(Detection).all()

    updated = 0
    high = 0
    for detection in detections:
        location = db.query(Location).filter(Location.detection_id == detection.id).first()
        score = ai_service.score_detection(
            detection,
            config,
            has_location=location is not None,
            verified=bool(location.verified) if location else False,
        )
        if not score:
            continue

        record = (
            db.query(PriorityScore)
            .filter(PriorityScore.detection_id == detection.id)
            .first()
        )
        if record is None:
            record = PriorityScore(detection_id=detection.id)
            db.add(record)

        record.severity = score["severity"]
        record.confidence_component = score["confidence"]
        record.risk = score["risk"]
        record.location_component = score["location_component"]
        record.severity_contribution = score["severity_contribution"]
        record.confidence_contribution = score["confidence_contribution"]
        record.risk_contribution = score["risk_contribution"]
        record.location_contribution = score["location_contribution"]
        record.total_score = score["priority_score"]
        record.category = score["priority"]
        record.weights = score["weights"]
        record.config_snapshot = config
        updated += 1
        if score["priority"] == "high":
            high += 1

    db.commit()
    return {"updated": updated, "high_priority": high}
