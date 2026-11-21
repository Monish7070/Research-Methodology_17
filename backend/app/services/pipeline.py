"""Background processing pipeline for uploaded videos/images."""

from __future__ import annotations

import logging
import threading
import time
import traceback
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import DEFAULT_PRIORITY_CONFIG, settings
from app.database.db import SessionLocal
from app.models.models import (
    Detection,
    ExplainabilityResult,
    Keyframe,
    Location,
    PriorityScore,
    ProcessingJob,
    Video,
)
from app.services import ai_service, reports
from app.services.storage import ensure_job_dirs

logger = logging.getLogger("urbanvision.pipeline")

STAGE_DEFINITIONS = [
    ("uploaded", "Video uploaded"),
    ("keyframes", "SSIM keyframe extraction"),
    ("detection", "YOLO object detection"),
    ("layercam", "LayerCAM explanation generation"),
    ("priority", "Maintenance priority calculation"),
    ("storage", "Database storage"),
    ("report", "Report generation"),
]

_RUNNING: dict[int, threading.Thread] = {}
_RUNNING_LOCK = threading.Lock()


def initial_stages() -> list[dict]:
    return [
        {"key": key, "label": label, "status": "pending", "message": "", "updated_at": None}
        for key, label in STAGE_DEFINITIONS
    ]


def is_job_running(job_id: int) -> bool:
    with _RUNNING_LOCK:
        thread = _RUNNING.get(job_id)
        return bool(thread and thread.is_alive())


def start_job_async(job_id: int) -> None:
    with _RUNNING_LOCK:
        existing = _RUNNING.get(job_id)
        if existing and existing.is_alive():
            return
        thread = threading.Thread(target=_run_job_safe, args=(job_id,), daemon=True, name=f"job-{job_id}")
        _RUNNING[job_id] = thread
        thread.start()


def _run_job_safe(job_id: int) -> None:
    try:
        _run_job(job_id)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Job %s crashed", job_id)
        db = SessionLocal()
        try:
            job = db.get(ProcessingJob, job_id)
            if job:
                job.status = "failed"
                job.error_message = f"{type(exc).__name__}: {exc}"
                job.finished_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()
    finally:
        with _RUNNING_LOCK:
            _RUNNING.pop(job_id, None)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update_stage(db: Session, job: ProcessingJob, key: str, status: str, message: str = "", progress: int | None = None):
    # JSON columns do not track in-place mutation, so build fresh dicts and
    # explicitly flag the attribute as modified.
    stages = [dict(stage) for stage in (job.stages or initial_stages())]
    for stage in stages:
        if stage["key"] == key:
            stage["status"] = status
            if message:
                stage["message"] = message
            stage["updated_at"] = _now_iso()
    job.stages = stages
    flag_modified(job, "stages")
    job.current_stage = key
    if progress is not None:
        job.progress = max(0, min(100, progress))
    db.commit()
    logger.info("job=%s stage=%s status=%s %s", job.id, key, status, message)


def _priority_config(db: Session) -> dict:
    try:
        return ai_service.get_priority_config(db)
    except Exception:
        return dict(DEFAULT_PRIORITY_CONFIG)


def _run_job(job_id: int) -> None:
    db = SessionLocal()
    start = time.perf_counter()
    try:
        job = db.get(ProcessingJob, job_id)
        if not job:
            logger.error("Job %s not found", job_id)
            return
        video = db.get(Video, job.video_id)
        if not video:
            raise RuntimeError("Linked video record is missing")

        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        job.stages = initial_stages()
        job.progress = 2
        job.error_message = None
        db.commit()

        config = _priority_config(db)
        dirs = ensure_job_dirs(job.id)
        job_config = job.config or {}
        threshold = job_config.get("threshold", settings.KEYFRAME_THRESHOLD)
        temporal_gap = job_config.get("temporal_gap", settings.KEYFRAME_GAP)
        conf_threshold = job_config.get("conf_threshold", settings.CONF_THRESHOLD)
        max_layercam = job_config.get("max_layercam", settings.MAX_LAYERCAM_PER_JOB)
        frame_stride = int(job_config.get("frame_stride") or settings.KEYFRAME_STRIDE)
        image_size = int(job_config.get("image_size") or settings.IMAGE_SIZE)

        _update_stage(db, job, "uploaded", "completed", f"{video.original_filename}", progress=5)

        # --- stage 1: keyframes -------------------------------------------
        stride_note = f" (sampling every {frame_stride} frame(s))" if frame_stride > 1 else ""
        _update_stage(
            db,
            job,
            "keyframes",
            "running",
            f"Reading frames and comparing SSIM{stride_note}",
            progress=8,
        )

        def keyframe_progress(percent, frames_read, saved):
            _update_stage(
                db,
                job,
                "keyframes",
                "running",
                f"{frames_read} frames read, {saved} kept",
                progress=8 + int(percent * 0.22),
            )

        if video.media_type == "image":
            result = ai_service.register_single_image(video.path, dirs["keyframes"])
            _update_stage(db, job, "keyframes", "completed", "Single image registered as keyframe", progress=30)
        else:
            result = ai_service.run_keyframe_extraction(
                video.path,
                dirs["keyframes"],
                keyframe_progress,
                threshold=threshold,
                temporal_gap=temporal_gap,
                stride=frame_stride,
            )
            _update_stage(
                db,
                job,
                "keyframes",
                "completed",
                f"{result['keyframes_saved']} keyframes kept from {result['frames_read']} frames "
                f"({result['reduction_percent']}% reduction){stride_note}",
                progress=30,
            )

        job.frames_read = result["frames_read"]
        job.keyframes_saved = result["keyframes_saved"]
        job.reduction_percent = result["reduction_percent"]
        job.threshold = result["threshold"]
        job.temporal_gap = result["temporal_gap"]
        video.frame_count = video.frame_count or result["frames_read"]
        if result.get("duration_seconds"):
            video.duration_seconds = result["duration_seconds"]
        db.commit()

        keyframes_by_name: dict[str, Keyframe] = {}
        for frame in result["saved_frames"]:
            keyframe = Keyframe(
                job_id=job.id,
                frame_index=frame["frame_index"],
                filename=frame["filename"],
                path=frame["path"],
                timestamp_seconds=frame["timestamp_seconds"],
                width=frame.get("width"),
                height=frame.get("height"),
            )
            db.add(keyframe)
            keyframes_by_name[frame["filename"]] = keyframe
        db.commit()

        if not result["saved_frames"]:
            raise RuntimeError("No keyframes were extracted from this file")

        # --- stage 2: detection -------------------------------------------
        _update_stage(
            db,
            job,
            "detection",
            "running",
            f"Running YOLO11n on keyframes at {image_size}px",
            progress=33,
        )

        def detection_progress(done, total):
            if total:
                _update_stage(
                    db,
                    job,
                    "detection",
                    "running",
                    f"{done}/{total} keyframes analysed",
                    progress=33 + int(27 * done / total),
                )

        detection_records = ai_service.run_detection(
            dirs["keyframes"],
            detection_progress,
            conf_threshold=conf_threshold,
            imgsz=image_size,
        )

        total_detections = 0
        saved_detections: list[Detection] = []
        for record in detection_records:
            keyframe = keyframes_by_name.get(record["image"])
            annotated = None
            if record["detections"]:
                annotated = ai_service.save_annotated_frame(
                    record["path"],
                    record["detections"],
                    dirs["detections"] / f"annotated_{record['image']}",
                )
            for det in record["detections"]:
                detection = Detection(
                    job_id=job.id,
                    keyframe_id=keyframe.id if keyframe else None,
                    frame_name=record["image"],
                    class_name=det["class_name"],
                    confidence=float(det["confidence"]),
                    bbox=det.get("bbox"),
                    source=det.get("source", "yolo"),
                    image_path=record["path"],
                    annotated_path=annotated,
                    maintenance_status="newly_detected",
                )
                db.add(detection)
                saved_detections.append(detection)
                total_detections += 1

        db.commit()
        _update_stage(
            db,
            job,
            "detection",
            "completed",
            f"{total_detections} detection(s) across {len(detection_records)} keyframes",
            progress=62,
        )

        job.detections_count = total_detections
        db.commit()

        # Attach the upload-time location (if the operator entered one) to detections.
        if video.latitude is not None and video.longitude is not None:
            for detection in saved_detections:
                db.add(
                    Location(
                        detection_id=detection.id,
                        latitude=video.latitude,
                        longitude=video.longitude,
                        label=video.location_label or video.original_filename,
                        source="gps",
                        verified=False,
                        created_by_id=video.uploaded_by_id,
                    )
                )
            db.commit()

        # --- stage 3: LayerCAM --------------------------------------------
        explain_targets = sorted(saved_detections, key=lambda d: d.confidence, reverse=True)
        max_explain = max(0, int(max_layercam or 0))
        explain_targets = explain_targets[:max_explain]

        _update_stage(
            db,
            job,
            "layercam",
            "running" if explain_targets else "completed",
            f"Preparing {len(explain_targets)} LayerCAM explanation(s)"
            if explain_targets
            else "No detections to explain",
            progress=64,
        )

        explained = 0
        explain_errors = 0
        for index, detection in enumerate(explain_targets, start=1):
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
                    imgsz=image_size,
                )
                if results:
                    info = results[0]
                    explanation = ExplainabilityResult(
                        detection_id=detection.id,
                        method=info["cam_method"],
                        prediction_index=info["prediction_index"],
                        feature_layer=info["feature_layer"],
                        target_score=info["target_score"],
                        matching_iou=info["matching_iou"],
                        class_match_fallback=info["class_match_fallback"],
                        warning=info.get("warning"),
                        gradient_stats=info["gradient_stats"],
                        heatmap_stats=info["heatmap_stats"],
                        bbox_stats=info["bbox_stats"],
                        activation_shape=info["activation_shape"],
                        original_path=info["original_path"],
                        raw_cam_path=info["raw_cam_path"],
                        overlay_path=info["overlay_path"],
                        combined_path=info.get("combined_path"),
                    )
                    db.add(explanation)
                    db.commit()
                    explained += 1
                else:
                    explain_errors += 1
            except Exception as exc:
                logger.warning("LayerCAM failed for detection %s: %s", detection.id, exc)
                explain_errors += 1
                db.rollback()

            _update_stage(
                db,
                job,
                "layercam",
                "running",
                f"{index}/{len(explain_targets)} explanations generated",
                progress=64 + int(14 * index / max(len(explain_targets), 1)),
            )

        job.layercam_count = explained
        db.commit()
        _update_stage(
            db,
            job,
            "layercam",
            "completed",
            f"{explained} LayerCAM explanation(s) generated"
            + (f", {explain_errors} failed" if explain_errors else "")
            + (
                f" (top {len(explain_targets)} by confidence; generate more individually)"
                if total_detections > len(explain_targets)
                else ""
            ),
            progress=79,
        )

        # --- stage 4: priority --------------------------------------------
        _update_stage(db, job, "priority", "running", "Applying weighted priority model", progress=81)

        high = 0
        for detection in saved_detections:
            location = (
                db.query(Location).filter(Location.detection_id == detection.id).first()
            )
            score = ai_service.score_detection(
                detection,
                config,
                has_location=location is not None,
                verified=bool(location.verified) if location else False,
            )
            if not score:
                continue
            db.add(
                PriorityScore(
                    detection_id=detection.id,
                    severity=score["severity"],
                    confidence_component=score["confidence"],
                    risk=score["risk"],
                    location_component=score["location_component"],
                    severity_contribution=score["severity_contribution"],
                    confidence_contribution=score["confidence_contribution"],
                    risk_contribution=score["risk_contribution"],
                    location_contribution=score["location_contribution"],
                    total_score=score["priority_score"],
                    category=score["priority"],
                    weights=score["weights"],
                    config_snapshot=config,
                )
            )
            if score["priority"] == "high":
                high += 1
        db.commit()

        job.high_priority_count = high
        _update_stage(
            db,
            job,
            "priority",
            "completed",
            f"{high} high-priority case(s) out of {total_detections}",
            progress=88,
        )

        # --- stage 5: storage ---------------------------------------------
        _update_stage(db, job, "storage", "running", "Persisting pipeline results", progress=90)
        db.commit()
        _update_stage(db, job, "storage", "completed", "All results stored", progress=92)

        # --- stage 6: report ----------------------------------------------
        _update_stage(db, job, "report", "running", "Building processing report", progress=95)
        try:
            report = reports.generate_processing_report(db, job, created_by_id=job.created_by_id)
            report_message = f"PDF and CSV reports generated (report #{report.id})"
        except Exception as exc:
            logger.exception("Report generation failed for job %s", job.id)
            report_message = f"Report generation failed: {exc}"
        _update_stage(db, job, "report", "completed", report_message, progress=99)

        job.status = "completed"
        job.progress = 100
        job.finished_at = datetime.now(timezone.utc)
        job.duration_seconds = round(time.perf_counter() - start, 2)
        video.status = "processed"
        db.commit()
        logger.info("Job %s completed in %.1fs", job.id, job.duration_seconds)

    except Exception as exc:
        logger.error("Job %s failed: %s\n%s", job_id, exc, traceback.format_exc())
        db.rollback()
        job = db.get(ProcessingJob, job_id)
        if job:
            job.status = "failed"
            job.error_message = f"{type(exc).__name__}: {exc}"
            job.finished_at = datetime.now(timezone.utc)
            job.duration_seconds = round(time.perf_counter() - start, 2)
            stages = list(job.stages or initial_stages())
            for stage in stages:
                if stage["status"] in {"running", "pending"}:
                    stage["status"] = "failed" if stage["status"] == "running" else "skipped"
                    stage["updated_at"] = _now_iso()
            job.stages = stages
            video = db.get(Video, job.video_id)
            if video:
                video.status = "failed"
            db.commit()
    finally:
        db.close()
