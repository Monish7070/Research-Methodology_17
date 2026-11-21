"""AI integration layer: model singletons plus the four pipeline stages."""

from __future__ import annotations

import logging
import threading
from pathlib import Path

import cv2
import numpy as np

from app.core.config import DEFAULT_PRIORITY_CONFIG, ROLE_ADMIN, settings
from app.models.models import SystemSetting
from src import gradcam_yolo
from src.member1_keyframes import extract_keyframes
from src.member2_detection import analyze_images, load_model

logger = logging.getLogger("urbanvision.ai")

_MODEL_LOCK = threading.Lock()
_MODEL = None
_MODEL_PATH: str | None = None

_EXPLAIN_LOCK = threading.Lock()
_EXPLAIN = None
_EXPLAIN_PATH: str | None = None


class ModelUnavailableError(RuntimeError):
    pass


def get_detection_model():
    """Load the trained YOLO model once per backend worker."""
    global _MODEL, _MODEL_PATH
    weights = Path(settings.MODEL_WEIGHTS)
    if not weights.exists():
        raise ModelUnavailableError(
            f"Trained model not found at {weights}. Place the trained best.pt there "
            f"or set YOLO_WEIGHTS in backend/.env."
        )
    with _MODEL_LOCK:
        if _MODEL is None or _MODEL_PATH != str(weights.resolve()):
            logger.info("Loading YOLO model from %s", weights)
            _MODEL = load_model(weights)
            _MODEL_PATH = str(weights.resolve())
        return _MODEL


def get_explainability_model():
    """Load the raw network + Detect head once for LayerCAM."""
    global _EXPLAIN, _EXPLAIN_PATH
    model = get_detection_model()
    weights = str(Path(settings.MODEL_WEIGHTS).resolve())
    with _EXPLAIN_LOCK:
        if _EXPLAIN is None or _EXPLAIN_PATH != weights:
            logger.info("Preparing LayerCAM network from %s", weights)
            _EXPLAIN = gradcam_yolo.load_explainability_model(weights)
            _EXPLAIN_PATH = weights
        return _EXPLAIN


def model_status() -> dict:
    weights = Path(settings.MODEL_WEIGHTS)
    info = {
        "weights_path": str(weights),
        "exists": weights.exists(),
        "loaded": _MODEL is not None,
        "classes": [],
        "device": "unavailable",
        "size_mb": round(weights.stat().st_size / (1024 * 1024), 2) if weights.exists() else None,
    }
    if info["exists"]:
        try:
            model = load_model(weights)
            info["classes"] = [model.names[i] for i in sorted(model.names)]
            try:
                import torch

                info["device"] = "cuda" if torch.cuda.is_available() else "cpu"
                info["torch_version"] = torch.__version__
            except Exception:  # pragma: no cover - torch always present with ultralytics
                pass
        except Exception as exc:  # pragma: no cover
            info["error"] = str(exc)
    return info


# --- stage 1 -----------------------------------------------------------------
def run_keyframe_extraction(
    video_path, output_dir, progress_cb=None, threshold=None, temporal_gap=None, stride=None
):
    return extract_keyframes(
        video_path,
        output_dir,
        threshold=threshold if threshold is not None else settings.KEYFRAME_THRESHOLD,
        resize_width=settings.KEYFRAME_RESIZE_WIDTH,
        temporal_gap=temporal_gap if temporal_gap is not None else settings.KEYFRAME_GAP,
        progress_cb=progress_cb,
        stride=stride if stride is not None else settings.KEYFRAME_STRIDE,
    )


def register_single_image(image_path, output_dir) -> dict:
    """Images are treated as a single keyframe so the pipeline is uniform."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    image = cv2.imread(str(image_path))
    if image is None:
        raise RuntimeError(f"Unreadable image: {image_path}")
    target = output_dir / Path(image_path).name
    if Path(image_path).resolve() != target.resolve():
        cv2.imwrite(str(target), image)
    height, width = image.shape[:2]
    return {
        "frames_read": 1,
        "keyframes_saved": 1,
        "reduction_percent": 0.0,
        "temporal_gap": settings.KEYFRAME_GAP,
        "threshold": settings.KEYFRAME_THRESHOLD,
        "fps": 0.0,
        "duration_seconds": 0.0,
        "frame_width": width,
        "frame_height": height,
        "saved_frames": [
            {
                "filename": target.name,
                "path": str(target),
                "frame_index": 0,
                "timestamp_seconds": 0.0,
                "width": width,
                "height": height,
            }
        ],
    }


# --- stage 2 -----------------------------------------------------------------
def run_detection(images_dir, progress_cb=None, conf_threshold=None, imgsz=None):
    model = get_detection_model()
    return analyze_images(
        images_dir,
        mode="yolo",
        model=model,
        conf=conf_threshold if conf_threshold is not None else settings.CONF_THRESHOLD,
        imgsz=imgsz if imgsz is not None else settings.IMAGE_SIZE,
        progress_cb=progress_cb,
    )


def save_annotated_frame(image_path, detections, target_path):
    """Draw YOLO boxes with class labels on the image for the results gallery."""
    image = cv2.imread(str(image_path))
    if image is None:
        return None
    colors = gradcam_yolo.CLASS_COLORS
    for det in detections:
        bbox = det.get("bbox")
        if not bbox:
            continue
        x1, y1, x2, y2 = map(int, bbox)
        name = str(det.get("class_name", "")).lower()
        color = colors.get(name, (0, 255, 255))
        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
        label = f"{det['class_name']} {float(det['confidence']):.2f}"
        text_y = max(18, y1 - 8)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.rectangle(image, (x1, text_y - th - 6), (x1 + tw + 4, text_y + 2), color, -1)
        cv2.putText(
            image,
            label,
            (x1 + 2, text_y - 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )
    target = Path(target_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(target), image)
    return str(target)


# --- stage 3 -----------------------------------------------------------------
def run_layercam(image_path, detections, output_dir, detection_offset=0, imgsz=None):
    """Generate LayerCAM for the supplied detections of a single frame."""
    _, net, head, class_to_id = get_explainability_model()
    frame_record = {"image": Path(image_path).name, "detections": detections}
    return gradcam_yolo.process_frame(
        image_path=Path(image_path),
        frame_record=frame_record,
        model=None,
        net=net,
        head=head,
        class_to_id=class_to_id,
        output_dir=Path(output_dir),
        imgsz=imgsz if imgsz is not None else settings.IMAGE_SIZE,
        iou_threshold=settings.IOU_THRESHOLD,
        cam_method=settings.CAM_METHOD,
        cam_opacity=settings.CAM_OPACITY,
        cam_threshold=settings.CAM_THRESHOLD,
        cam_blur=settings.CAM_BLUR,
        cam_style=settings.CAM_STYLE,
        cam_gamma=settings.CAM_GAMMA,
        detection_offset=detection_offset,
    )


# --- priority config ---------------------------------------------------------
def get_priority_config(db) -> dict:
    setting = db.query(SystemSetting).filter(SystemSetting.key == "priority_config").first()
    if not setting or not isinstance(setting.value, dict):
        return dict(DEFAULT_PRIORITY_CONFIG)
    merged = {**DEFAULT_PRIORITY_CONFIG, **setting.value}
    merged["weights"] = {**DEFAULT_PRIORITY_CONFIG["weights"], **setting.value.get("weights", {})}
    merged["class_severity"] = {
        **DEFAULT_PRIORITY_CONFIG["class_severity"],
        **setting.value.get("class_severity", {}),
    }
    merged["class_risk"] = {
        **DEFAULT_PRIORITY_CONFIG["class_risk"],
        **setting.value.get("class_risk", {}),
    }
    merged["location"] = {**DEFAULT_PRIORITY_CONFIG["location"], **setting.value.get("location", {})}
    merged["categories"] = {
        **DEFAULT_PRIORITY_CONFIG["categories"],
        **setting.value.get("categories", {}),
    }
    return merged


def validate_priority_config(payload: dict) -> dict:
    from src.priority_scoring import DEFAULT_CONFIG

    weights = payload.get("weights", {})
    required = ("severity", "confidence", "risk", "location")
    values = {key: float(weights.get(key, DEFAULT_CONFIG["weights"][key])) for key in required}
    if any(v < 0 or v > 1 for v in values.values()):
        raise ValueError("All weights must be between 0 and 1")
    if abs(sum(values.values()) - 1.0) > 1e-3:
        raise ValueError(f"Weights must sum to 1.0 (currently {sum(values.values()):.3f})")

    for key in ("class_severity", "class_risk"):
        for name, value in (payload.get(key) or {}).items():
            if not 0.0 <= float(value) <= 1.0:
                raise ValueError(f"{key}.{name} must be between 0 and 1")

    categories = payload.get("categories") or {}
    low_max = float(categories.get("low_max", 39))
    medium_max = float(categories.get("medium_max", 69))
    if not (0 <= low_max < medium_max < 100):
        raise ValueError("Category thresholds must satisfy 0 <= low_max < medium_max < 100")

    return {
        "weights": values,
        "class_severity": {k: float(v) for k, v in (payload.get("class_severity") or {}).items()},
        "class_risk": {k: float(v) for k, v in (payload.get("class_risk") or {}).items()},
        "location": {k: float(v) for k, v in (payload.get("location") or {}).items()},
        "categories": {"low_max": low_max, "medium_max": medium_max},
    }


def score_detection(detection, config, has_location: bool, verified: bool) -> dict | None:
    from src.priority_scoring import calculate_priority

    return calculate_priority(
        {"class_name": detection.class_name, "confidence": detection.confidence},
        config=config,
        has_location=has_location,
        location_verified=verified,
    )


def describe_environment() -> dict:
    return {
        "model": model_status(),
        "cam_method": settings.CAM_METHOD,
        "image_size": settings.IMAGE_SIZE,
        "conf_threshold": settings.CONF_THRESHOLD,
        "keyframe_threshold": settings.KEYFRAME_THRESHOLD,
        "keyframe_gap": settings.KEYFRAME_GAP,
        "max_layercam_per_job": settings.MAX_LAYERCAM_PER_JOB,
        "admin_role": ROLE_ADMIN,
    }
