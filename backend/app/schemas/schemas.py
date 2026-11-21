"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

RoleName = Literal["admin", "officer", "inspector"]
MaintenanceStatus = Literal[
    "newly_detected",
    "pending_review",
    "approved",
    "assigned",
    "in_progress",
    "resolved",
    "rejected",
]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: RoleName = "inspector"

    @field_validator("password")
    @classmethod
    def strong_enough(cls, value: str) -> str:
        if value.lower() == value and value.isalpha():
            raise ValueError("Password must include a number or symbol")
        return value


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict[str, Any]


class UserCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: RoleName = "inspector"


class UserUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    role: RoleName | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class ProcessingStartRequest(BaseModel):
    threshold: float | None = Field(default=None, gt=0, lt=1)
    temporal_gap: int | None = Field(default=None, ge=1, le=120)
    conf_threshold: float | None = Field(default=None, gt=0, lt=1)
    max_layercam: int | None = Field(default=None, ge=0, le=50)
    # Every Nth decoded frame is compared/saved; 1 processes every frame.
    frame_stride: int | None = Field(default=None, ge=1, le=60)
    # YOLO inference resolution. Raise it for wide-angle HD/4K fleet footage so
    # small potholes/cracks keep enough pixels.
    image_size: int | None = Field(default=None, ge=320, le=1536)


class LocationUpdateRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    label: str = Field(default="", max_length=255)
    road_name: str = Field(default="", max_length=255)
    verified: bool = False


class MaintenanceCreateRequest(BaseModel):
    detection_id: int
    assigned_to_id: int | None = None
    title: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=4000)
    status: MaintenanceStatus = "pending_review"


class MaintenanceUpdateRequest(BaseModel):
    status: MaintenanceStatus | None = None
    assigned_to_id: int | None = None
    notes: str | None = Field(default=None, max_length=4000)
    resolution_notes: str | None = Field(default=None, max_length=4000)
    comment: str | None = Field(default=None, max_length=2000)
    due_date: datetime | None = None


class DefectStatusRequest(BaseModel):
    status: MaintenanceStatus
    comment: str = Field(default="", max_length=2000)


class PriorityConfigRequest(BaseModel):
    weights: dict[str, float]
    class_severity: dict[str, float]
    class_risk: dict[str, float]
    location: dict[str, float]
    categories: dict[str, float]


class PriorityRecalculateRequest(BaseModel):
    job_id: int | None = None


class ReportGenerateRequest(BaseModel):
    report_type: Literal["defect", "job", "daily", "weekly", "monthly"]
    job_id: int | None = None
    detection_id: int | None = None
    start_date: str | None = None
    end_date: str | None = None


class SettingUpdateRequest(BaseModel):
    key: str = Field(min_length=2, max_length=80)
    value: Any


class MessageResponse(BaseModel):
    message: str
