"""LayerCAM explainability routes."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.serializers import detection_out, explanation_out
from app.core.config import settings
from app.core.deps import get_current_user, require_permission
from app.database.db import get_db
from app.models.models import Detection, ExplainabilityResult, User
from app.services import ai_service
from app.services.storage import ensure_job_dirs

router = APIRouter(prefix="/explainability", tags=["Explainability"])


def _build_explanation(db: Session, detection: Detection) -> ExplainabilityResult:
    if not Path(detection.image_path).exists():
        raise HTTPException(status_code=410, detail="Source keyframe image is missing from disk")
    if not settings.MODEL_WEIGHTS.exists():
        raise HTTPException(status_code=503, detail="Trained model not available")

    dirs = ensure_job_dirs(detection.job_id)
    try:
        results = ai_service.run_layercam(
            detection.image_path,
            [
                {
                    "class_name": detection.class_name,
                    "confidence": detection.confidence,
                    "bbox": detection.bbox,
                    "source": detection.source,
                }
            ],
            dirs["gradcam"],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LayerCAM generation failed: {exc}")

    if not results:
        raise HTTPException(
            status_code=422,
            detail="LayerCAM could not match this detection to a YOLO prediction anchor",
        )

    info = results[0]
    existing = (
        db.query(ExplainabilityResult)
        .filter(ExplainabilityResult.detection_id == detection.id)
        .first()
    )
    if existing is None:
        existing = ExplainabilityResult(detection_id=detection.id)
        db.add(existing)

    existing.method = info["cam_method"]
    existing.prediction_index = info["prediction_index"]
    existing.feature_layer = info["feature_layer"]
    existing.target_score = info["target_score"]
    existing.matching_iou = info["matching_iou"]
    existing.class_match_fallback = info["class_match_fallback"]
    existing.warning = info.get("warning")
    existing.gradient_stats = info["gradient_stats"]
    existing.heatmap_stats = info["heatmap_stats"]
    existing.bbox_stats = info["bbox_stats"]
    existing.activation_shape = info["activation_shape"]
    existing.original_path = info["original_path"]
    existing.raw_cam_path = info["raw_cam_path"]
    existing.overlay_path = info["overlay_path"]
    existing.combined_path = info.get("combined_path")
    db.commit()
    db.refresh(existing)
    return existing


@router.post("/generate/{detection_id}")
def generate_explanation(
    detection_id: int,
    current_user: User = Depends(require_permission("explainability:generate")),
    db: Session = Depends(get_db),
):
    detection = db.get(Detection, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    explanation = _build_explanation(db, detection)
    return {
        "message": "LayerCAM explanation generated",
        "explanation": explanation_out(explanation),
        "detection": detection_out(detection),
    }


@router.get("")
def list_explanations(
    job_id: int | None = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(ExplainabilityResult)
    if job_id:
        query = query.join(Detection, Detection.id == ExplainabilityResult.detection_id).filter(
            Detection.job_id == job_id
        )
    items = query.order_by(ExplainabilityResult.created_at.desc()).limit(min(limit, 200)).all()
    return {
        "total": len(items),
        "items": [
            {
                **explanation_out(item),
                "detection": detection_out(item.detection),
            }
            for item in items
        ],
    }


@router.get("/{detection_id}")
def get_explanation(
    detection_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    detection = db.get(Detection, detection_id)
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    explanation = (
        db.query(ExplainabilityResult)
        .filter(ExplainabilityResult.detection_id == detection_id)
        .first()
    )
    return {
        "detection": detection_out(detection),
        "explanation": explanation_out(explanation) if explanation else None,
    }
