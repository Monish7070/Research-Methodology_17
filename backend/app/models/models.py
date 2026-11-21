"""SQLAlchemy ORM models for Urban Vision AI."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String(40), unique=True, nullable=False, index=True)
    description = Column(String(255), default="")
    permissions = Column(JSON, default=list)

    users = relationship("User", back_populates="role")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    email = Column(String(180), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    role = relationship("Role", back_populates="users")


class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    path = Column(String(512), nullable=False)
    media_type = Column(String(20), default="video", nullable=False)  # video | image
    mime_type = Column(String(120), default="")
    size_bytes = Column(Integer, default=0)
    duration_seconds = Column(Float, nullable=True)
    frame_count = Column(Integer, nullable=True)
    status = Column(String(30), default="uploaded", nullable=False)
    location_label = Column(String(255), default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=utcnow, nullable=False)

    uploaded_by = relationship("User")
    jobs = relationship("ProcessingJob", back_populates="video", cascade="all, delete-orphan")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(Integer, primary_key=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False, index=True)
    status = Column(String(20), default="queued", nullable=False)  # queued|running|completed|failed
    current_stage = Column(String(50), default="queued")
    progress = Column(Integer, default=0)
    stages = Column(JSON, default=list)
    frames_read = Column(Integer, default=0)
    keyframes_saved = Column(Integer, default=0)
    reduction_percent = Column(Float, default=0.0)
    threshold = Column(Float, nullable=True)
    temporal_gap = Column(Integer, nullable=True)
    detections_count = Column(Integer, default=0)
    high_priority_count = Column(Integer, default=0)
    layercam_count = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    config = Column(JSON, default=dict)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    video = relationship("Video", back_populates="jobs")
    created_by = relationship("User")
    keyframes = relationship(
        "Keyframe", back_populates="job", cascade="all, delete-orphan", order_by="Keyframe.frame_index"
    )
    detections = relationship("Detection", back_populates="job", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="job")


class Keyframe(Base):
    __tablename__ = "keyframes"

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("processing_jobs.id"), nullable=False, index=True)
    frame_index = Column(Integer, nullable=False)
    filename = Column(String(255), nullable=False)
    path = Column(String(512), nullable=False)
    timestamp_seconds = Column(Float, default=0.0)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    job = relationship("ProcessingJob", back_populates="keyframes")
    detections = relationship("Detection", back_populates="keyframe")


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("processing_jobs.id"), nullable=False, index=True)
    keyframe_id = Column(Integer, ForeignKey("keyframes.id"), nullable=True, index=True)
    frame_name = Column(String(255), nullable=False)
    class_name = Column(String(40), nullable=False, index=True)
    confidence = Column(Float, nullable=False)
    bbox = Column(JSON, nullable=True)
    source = Column(String(60), default="yolo")
    image_path = Column(String(512), nullable=False)
    annotated_path = Column(String(512), nullable=True)
    maintenance_status = Column(String(30), default="newly_detected", nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    job = relationship("ProcessingJob", back_populates="detections")
    keyframe = relationship("Keyframe", back_populates="detections")
    explanation = relationship(
        "ExplainabilityResult", back_populates="detection", uselist=False, cascade="all, delete-orphan"
    )
    priority = relationship(
        "PriorityScore", back_populates="detection", uselist=False, cascade="all, delete-orphan"
    )
    location = relationship(
        "Location", back_populates="detection", uselist=False, cascade="all, delete-orphan"
    )
    tasks = relationship("MaintenanceTask", back_populates="detection", cascade="all, delete-orphan")
    history = relationship(
        "StatusHistory",
        back_populates="detection",
        cascade="all, delete-orphan",
        order_by="StatusHistory.created_at",
    )


class ExplainabilityResult(Base):
    __tablename__ = "explainability_results"

    id = Column(Integer, primary_key=True)
    detection_id = Column(Integer, ForeignKey("detections.id"), nullable=False, unique=True, index=True)
    method = Column(String(20), default="layercam", nullable=False)
    prediction_index = Column(Integer, nullable=True)
    feature_layer = Column(Integer, nullable=True)
    target_score = Column(Float, nullable=True)
    matching_iou = Column(Float, nullable=True)
    class_match_fallback = Column(Boolean, default=False)
    warning = Column(Text, nullable=True)
    gradient_stats = Column(JSON, default=dict)
    heatmap_stats = Column(JSON, default=dict)
    bbox_stats = Column(JSON, default=dict)
    activation_shape = Column(JSON, default=list)
    original_path = Column(String(512), nullable=True)
    raw_cam_path = Column(String(512), nullable=True)
    overlay_path = Column(String(512), nullable=True)
    combined_path = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    detection = relationship("Detection", back_populates="explanation")


class PriorityScore(Base):
    __tablename__ = "priority_scores"

    id = Column(Integer, primary_key=True)
    detection_id = Column(Integer, ForeignKey("detections.id"), nullable=False, unique=True, index=True)
    severity = Column(Float, nullable=False)
    confidence_component = Column(Float, nullable=False)
    risk = Column(Float, nullable=False)
    location_component = Column(Float, nullable=False)
    severity_contribution = Column(Float, nullable=False)
    confidence_contribution = Column(Float, nullable=False)
    risk_contribution = Column(Float, nullable=False)
    location_contribution = Column(Float, nullable=False)
    total_score = Column(Float, nullable=False, index=True)
    category = Column(String(20), nullable=False, index=True)
    weights = Column(JSON, default=dict)
    config_snapshot = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    detection = relationship("Detection", back_populates="priority")


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True)
    detection_id = Column(Integer, ForeignKey("detections.id"), nullable=False, unique=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    label = Column(String(255), default="")
    road_name = Column(String(255), default="")
    source = Column(String(30), default="manual", nullable=False)  # gps | manual
    verified = Column(Boolean, default=False, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    detection = relationship("Detection", back_populates="location")
    created_by = relationship("User")


class MaintenanceTask(Base):
    __tablename__ = "maintenance_tasks"

    id = Column(Integer, primary_key=True)
    detection_id = Column(Integer, ForeignKey("detections.id"), nullable=False, index=True)
    title = Column(String(200), default="")
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(30), default="pending_review", nullable=False, index=True)
    notes = Column(Text, default="")
    resolution_notes = Column(Text, default="")
    due_date = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    detection = relationship("Detection", back_populates="tasks")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    history = relationship(
        "StatusHistory",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="StatusHistory.created_at",
    )


class StatusHistory(Base):
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True)
    detection_id = Column(Integer, ForeignKey("detections.id"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("maintenance_tasks.id"), nullable=True, index=True)
    from_status = Column(String(30), nullable=True)
    to_status = Column(String(30), nullable=False)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    comment = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow, nullable=False)

    detection = relationship("Detection", back_populates="history")
    task = relationship("MaintenanceTask", back_populates="history")
    changed_by = relationship("User")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)
    report_type = Column(String(30), nullable=False)  # defect | job | daily | weekly | monthly
    title = Column(String(255), nullable=False)
    job_id = Column(Integer, ForeignKey("processing_jobs.id"), nullable=True)
    detection_id = Column(Integer, ForeignKey("detections.id"), nullable=True)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    pdf_path = Column(String(512), nullable=True)
    csv_path = Column(String(512), nullable=True)
    summary = Column(JSON, default=dict)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    job = relationship("ProcessingJob", back_populates="reports")
    created_by = relationship("User")


class SystemSetting(Base):
    __tablename__ = "system_settings"
    __table_args__ = (UniqueConstraint("key", name="uq_system_settings_key"),)

    id = Column(Integer, primary_key=True)
    key = Column(String(80), nullable=False, index=True)
    value = Column(JSON, nullable=False)
    description = Column(String(500), default="")
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    updated_by = relationship("User")
