"""JSON serializers shared by the API routes."""

from __future__ import annotations

from app.core.config import STATUS_LABELS
from app.models.models import (
    ExplainabilityResult,
    Keyframe,
    Location,
    MaintenanceTask,
    PriorityScore,
    ProcessingJob,
    Report,
    StatusHistory,
    User,
    Video,
)
from app.services.storage import media_url


def iso(value):
    return value.isoformat() if value else None


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role.name if user.role else None,
        "role_label": user.role.description if user.role else None,
        "permissions": list(user.role.permissions or []) if user.role else [],
        "is_active": user.is_active,
        "created_at": iso(user.created_at),
        "last_login_at": iso(user.last_login_at),
    }


def video_out(video: Video, jobs: list[ProcessingJob] | None = None) -> dict:
    latest = None
    if jobs is None:
        jobs = sorted(video.jobs, key=lambda j: j.id, reverse=True) if video.jobs else []
    if jobs:
        latest = jobs[0]
    return {
        "id": video.id,
        "original_filename": video.original_filename,
        "stored_filename": video.stored_filename,
        "media_type": video.media_type,
        "mime_type": video.mime_type,
        "size_bytes": video.size_bytes,
        "duration_seconds": video.duration_seconds,
        "frame_count": video.frame_count,
        "status": video.status,
        "location_label": video.location_label,
        "latitude": video.latitude,
        "longitude": video.longitude,
        "uploaded_at": iso(video.uploaded_at),
        "uploaded_by": video.uploaded_by.name if video.uploaded_by else None,
        "url": media_url(video.path),
        "latest_job_id": latest.id if latest else None,
        "latest_job_status": latest.status if latest else None,
        "jobs_count": len(jobs),
    }


def job_out(job: ProcessingJob, include_video: bool = True) -> dict:
    data = {
        "id": job.id,
        "video_id": job.video_id,
        "status": job.status,
        "current_stage": job.current_stage,
        "progress": job.progress,
        "stages": job.stages or [],
        "frames_read": job.frames_read,
        "keyframes_saved": job.keyframes_saved,
        "reduction_percent": job.reduction_percent,
        "threshold": job.threshold,
        "temporal_gap": job.temporal_gap,
        "detections_count": job.detections_count,
        "high_priority_count": job.high_priority_count,
        "layercam_count": job.layercam_count,
        "started_at": iso(job.started_at),
        "finished_at": iso(job.finished_at),
        "duration_seconds": job.duration_seconds,
        "error_message": job.error_message,
        "created_at": iso(job.created_at),
        "created_by": job.created_by.name if job.created_by else None,
    }
    if include_video and job.video:
        data["video"] = {
            "id": job.video.id,
            "original_filename": job.video.original_filename,
            "media_type": job.video.media_type,
            "duration_seconds": job.video.duration_seconds,
            "size_bytes": job.video.size_bytes,
            "url": media_url(job.video.path),
        }
    return data


def keyframe_out(keyframe: Keyframe) -> dict:
    return {
        "id": keyframe.id,
        "job_id": keyframe.job_id,
        "frame_index": keyframe.frame_index,
        "filename": keyframe.filename,
        "timestamp_seconds": keyframe.timestamp_seconds,
        "width": keyframe.width,
        "height": keyframe.height,
        "url": media_url(keyframe.path),
        "detection_count": len(keyframe.detections) if keyframe.detections else 0,
    }


def explanation_out(exp: ExplainabilityResult) -> dict:
    return {
        "id": exp.id,
        "detection_id": exp.detection_id,
        "method": exp.method,
        "prediction_index": exp.prediction_index,
        "feature_layer": exp.feature_layer,
        "target_score": exp.target_score,
        "matching_iou": exp.matching_iou,
        "class_match_fallback": exp.class_match_fallback,
        "warning": exp.warning,
        "gradient_stats": exp.gradient_stats or {},
        "heatmap_stats": exp.heatmap_stats or {},
        "bbox_stats": exp.bbox_stats or {},
        "activation_shape": exp.activation_shape or [],
        "original_url": media_url(exp.original_path),
        "raw_cam_url": media_url(exp.raw_cam_path),
        "overlay_url": media_url(exp.overlay_path),
        "combined_url": media_url(exp.combined_path),
        "created_at": iso(exp.created_at),
    }


def priority_out(score: PriorityScore | None) -> dict | None:
    if not score:
        return None
    return {
        "detection_id": score.detection_id,
        "total_score": score.total_score,
        "category": score.category,
        "severity": score.severity,
        "confidence_component": score.confidence_component,
        "risk": score.risk,
        "location_component": score.location_component,
        "severity_contribution": score.severity_contribution,
        "confidence_contribution": score.confidence_contribution,
        "risk_contribution": score.risk_contribution,
        "location_contribution": score.location_contribution,
        "weights": score.weights or {},
        "created_at": iso(score.created_at),
    }


def location_out(location: Location | None) -> dict | None:
    if not location:
        return None
    return {
        "id": location.id,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "label": location.label,
        "road_name": location.road_name,
        "source": location.source,
        "verified": location.verified,
        "created_at": iso(location.created_at),
        "created_by": location.created_by.name if location.created_by else None,
    }


def task_out(task: MaintenanceTask) -> dict:
    return {
        "id": task.id,
        "detection_id": task.detection_id,
        "title": task.title,
        "status": task.status,
        "status_label": STATUS_LABELS.get(task.status, task.status),
        "assigned_to_id": task.assigned_to_id,
        "assigned_to": task.assigned_to.name if task.assigned_to else None,
        "notes": task.notes,
        "resolution_notes": task.resolution_notes,
        "due_date": iso(task.due_date),
        "created_at": iso(task.created_at),
        "updated_at": iso(task.updated_at),
        "created_by": task.created_by.name if task.created_by else None,
    }


def history_out(entry: StatusHistory) -> dict:
    return {
        "id": entry.id,
        "detection_id": entry.detection_id,
        "task_id": entry.task_id,
        "from_status": entry.from_status,
        "to_status": entry.to_status,
        "to_status_label": STATUS_LABELS.get(entry.to_status, entry.to_status),
        "comment": entry.comment,
        "changed_by": entry.changed_by.name if entry.changed_by else "System",
        "created_at": iso(entry.created_at),
    }


def detection_out(detection, include_images: bool = True) -> dict:
    data = {
        "id": detection.id,
        "defect_code": f"DEF-{detection.id:05d}",
        "job_id": detection.job_id,
        "keyframe_id": detection.keyframe_id,
        "frame_name": detection.frame_name,
        "class_name": detection.class_name,
        "confidence": detection.confidence,
        "bbox": detection.bbox,
        "source": detection.source,
        "maintenance_status": detection.maintenance_status,
        "maintenance_status_label": STATUS_LABELS.get(
            detection.maintenance_status, detection.maintenance_status
        ),
        "detected_at": iso(detection.created_at),
        "priority": priority_out(detection.priority),
        "location": location_out(detection.location),
        "has_explanation": detection.explanation is not None,
        "explanation_id": detection.explanation.id if detection.explanation else None,
        "open_tasks": len(detection.tasks or []),
    }
    if include_images:
        data["image_url"] = media_url(detection.image_path)
        data["annotated_url"] = media_url(detection.annotated_path)
        data["explanation"] = explanation_out(detection.explanation) if detection.explanation else None
    return data


def report_out(report: Report) -> dict:
    return {
        "id": report.id,
        "report_type": report.report_type,
        "title": report.title,
        "job_id": report.job_id,
        "detection_id": report.detection_id,
        "period_start": iso(report.period_start),
        "period_end": iso(report.period_end),
        "summary": report.summary or {},
        "created_at": iso(report.created_at),
        "created_by": report.created_by.name if report.created_by else None,
        "pdf_url": media_url(report.pdf_path),
        "csv_url": media_url(report.csv_path),
        "download_url": f"/api/reports/download/{report.id}",
        "download_csv_url": f"/api/reports/download/{report.id}?format=csv",
    }
