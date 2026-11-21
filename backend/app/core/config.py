"""Central configuration. All values can be overridden through backend/.env."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")


def _flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    APP_NAME = "URBAN VISION AI"
    APP_VERSION = "1.0.0"
    API_PREFIX = "/api"

    SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-key-in-production")
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))

    # --- storage -----------------------------------------------------------
    DATA_DIR = Path(os.getenv("DATA_DIR", str(BACKEND_DIR / "data")))
    UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BACKEND_DIR / "uploads")))
    OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", str(BACKEND_DIR / "outputs")))
    REPORT_DIR = Path(os.getenv("REPORT_DIR", str(ROOT_DIR / "reports")))
    KEYFRAME_DIR = OUTPUT_DIR / "keyframes"
    DETECTION_DIR = OUTPUT_DIR / "detections"
    GRADCAM_DIR = OUTPUT_DIR / "gradcam"

    DATABASE_URL = os.getenv(
        "DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'data' / 'urban_vision.db').as_posix()}"
    )

    # --- AI -----------------------------------------------------------------
    MODEL_WEIGHTS = Path(
        os.getenv("YOLO_WEIGHTS", str(ROOT_DIR / "models" / "best.pt"))
    )
    IMAGE_SIZE = int(os.getenv("IMAGE_SIZE", "640"))
    CONF_THRESHOLD = float(os.getenv("CONF_THRESHOLD", "0.25"))
    IOU_THRESHOLD = float(os.getenv("IOU_THRESHOLD", "0.10"))

    KEYFRAME_THRESHOLD = float(os.getenv("KEYFRAME_THRESHOLD", "0.92"))
    KEYFRAME_GAP = int(os.getenv("KEYFRAME_GAP", "10"))
    KEYFRAME_RESIZE_WIDTH = int(os.getenv("KEYFRAME_RESIZE_WIDTH", "320"))
    # Fleet cameras record long, high-frame-rate clips. A stride above 1 only
    # compares every Nth decoded frame, which bounds keyframe extraction cost.
    KEYFRAME_STRIDE = int(os.getenv("KEYFRAME_STRIDE", "1"))

    CAM_METHOD = os.getenv("CAM_METHOD", "layercam")  # layercam | gradcam
    CAM_OPACITY = float(os.getenv("CAM_OPACITY", "0.45"))
    CAM_THRESHOLD = float(os.getenv("CAM_THRESHOLD", "0.12"))
    CAM_BLUR = float(os.getenv("CAM_BLUR", "2.0"))
    CAM_STYLE = os.getenv("CAM_STYLE", "classic")
    CAM_GAMMA = float(os.getenv("CAM_GAMMA", "1.0"))
    # Number of highest-confidence detections explained automatically in a job.
    MAX_LAYERCAM_PER_JOB = int(os.getenv("MAX_LAYERCAM_PER_JOB", "6"))

    # --- uploads ------------------------------------------------------------
    # Municipal DVR exports routinely run to several GB per shift segment.
    MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "2048"))
    # MKV/TS/M4V are common camera and DVR container formats. All are decoded
    # through the same OpenCV/FFmpeg reader as MP4. WEBM is what a phone browser
    # produces when the Field Capture page records from the camera.
    ALLOWED_VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".m4v", ".ts", ".webm"}
    ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
    ALLOWED_EXTS = ALLOWED_VIDEO_EXTS | ALLOWED_IMAGE_EXTS

    # --- dev seeding --------------------------------------------------------
    SEED_DEMO_DATA = _flag("SEED_DEMO_DATA", "true")
    DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "Urban@123")

    CORS_ORIGINS = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
        ).split(",")
        if o.strip()
    ]

    def ensure_dirs(self) -> None:
        for directory in (
            self.DATA_DIR,
            self.UPLOAD_DIR,
            self.OUTPUT_DIR,
            self.KEYFRAME_DIR,
            self.DETECTION_DIR,
            self.GRADCAM_DIR,
            self.REPORT_DIR,
        ):
            directory.mkdir(parents=True, exist_ok=True)


settings = Settings()

# --- maintenance workflow ------------------------------------------------
MAINTENANCE_STATUSES = [
    "newly_detected",
    "pending_review",
    "approved",
    "assigned",
    "in_progress",
    "resolved",
    "rejected",
]

STATUS_LABELS = {
    "newly_detected": "Newly detected",
    "pending_review": "Pending review",
    "approved": "Approved",
    "assigned": "Assigned",
    "in_progress": "In progress",
    "resolved": "Resolved",
    "rejected": "Rejected",
}

ROLE_ADMIN = "admin"
ROLE_OFFICER = "officer"
ROLE_INSPECTOR = "inspector"

ROLE_PERMISSIONS: dict[str, list[str]] = {
    ROLE_ADMIN: [
        "dashboard:view",
        "video:upload",
        "video:delete",
        "processing:start",
        "detection:view",
        "explainability:generate",
        "priority:view",
        "priority:configure",
        "defect:review",
        "defect:assign",
        "defect:update",
        "location:edit",
        "report:generate",
        "report:view",
        "user:manage",
        "settings:manage",
    ],
    ROLE_OFFICER: [
        "dashboard:view",
        "video:upload",
        "processing:start",
        "detection:view",
        "explainability:generate",
        "priority:view",
        "defect:review",
        "defect:assign",
        "defect:update",
        "location:edit",
        "report:generate",
        "report:view",
    ],
    ROLE_INSPECTOR: [
        "dashboard:view",
        "video:upload",
        "processing:start",
        "detection:view",
        "explainability:generate",
        "priority:view",
        "defect:update",
        "location:edit",
        "report:view",
    ],
}

# Defaults for the weighted priority model (P = 100 * (0.40S + 0.20C + 0.25R + 0.15L)).
# These are provisional project values and are editable by administrators in Settings.
DEFAULT_PRIORITY_CONFIG: dict = {
    "weights": {"severity": 0.40, "confidence": 0.20, "risk": 0.25, "location": 0.15},
    "class_severity": {"crack": 0.70, "garbage": 0.45, "pothole": 0.90},
    "class_risk": {"crack": 0.65, "garbage": 0.40, "pothole": 0.90},
    "location": {
        "verified": 1.0,
        "unverified": 0.35,
        "no_location": 0.20,
    },
    "categories": {"low_max": 39, "medium_max": 69},
    "notes": (
        "Severity (S) is a configurable per-class value, confidence (C) is the model "
        "confidence, risk (R) is a configurable per-class safety risk, and location (L) "
        "reflects whether the defect has a verified GPS location. Replace these "
        "provisional values with field-measured definitions when available."
    ),
}
