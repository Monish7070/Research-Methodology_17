"""Video and image upload routes."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.serializers import video_out
from app.core.config import settings
from app.core.deps import get_current_user, require_permission
from app.database.db import get_db
from app.models.models import Report, User, Video
from app.services.storage import remove_tree, safe_name

router = APIRouter(prefix="/videos", tags=["Videos"])


def _probe(path: Path, media_type: str) -> dict:
    info = {"duration_seconds": None, "frame_count": None, "decodable": True}
    if media_type == "video":
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            info["decodable"] = False
        else:
            fps = cap.get(cv2.CAP_PROP_FPS) or 0
            frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            # Streamed containers (browser WebM, live DVR files) have no index and
            # report a placeholder count near 2**63. Discard impossible values so
            # the UI never shows a bogus frame count or duration.
            if not 0 < fps <= 240:
                fps = 0
            if frames <= 0 or frames > 5_000_000:
                frames = 0
            if fps and frames:
                info["duration_seconds"] = round(float(frames) / float(fps), 2)
            info["frame_count"] = frames or None
            if not frames:
                # Browser MediaRecorder output (and some streaming DVR files) has
                # no duration/index header, so the frame count is unknown. Check
                # that the stream decodes instead of rejecting a valid clip.
                info["decodable"] = bool(cap.read()[0])
        cap.release()
    return info


def _video_formats() -> str:
    return ", ".join(sorted(ext.lstrip(".").upper() for ext in settings.ALLOWED_VIDEO_EXTS))


@router.post("/upload", status_code=201)
async def upload_video(
    file: UploadFile = File(...),
    location_label: str = Form(""),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    current_user: User = Depends(require_permission("video:upload")),
    db: Session = Depends(get_db),
):
    original = file.filename or "upload"
    extension = Path(original).suffix.lower()

    if extension not in settings.ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{extension}'. Allowed video: {_video_formats()}; "
                "images: JPG, JPEG, PNG."
            ),
        )

    media_type = "video" if extension in settings.ALLOWED_VIDEO_EXTS else "image"
    stored_name = f"{uuid.uuid4().hex[:12]}_{safe_name(original)}"
    upload_dir = settings.UPLOAD_DIR / ("videos" if media_type == "video" else "images")
    upload_dir.mkdir(parents=True, exist_ok=True)
    target = upload_dir / stored_name

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    written = 0
    try:
        with target.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB upload limit",
                    )
                handle.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")

    if written == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The uploaded file is empty")

    probe = _probe(target, media_type)
    if media_type == "video" and not probe["decodable"]:
        target.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=f"This video could not be decoded. Please upload a valid {_video_formats()} file.",
        )

    video = Video(
        original_filename=original,
        stored_filename=stored_name,
        path=str(target),
        media_type=media_type,
        mime_type=file.content_type or "",
        size_bytes=written,
        duration_seconds=probe["duration_seconds"],
        frame_count=probe["frame_count"],
        status="uploaded",
        location_label=location_label.strip(),
        latitude=latitude,
        longitude=longitude,
        uploaded_by_id=current_user.id,
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    return video_out(video, jobs=[])


@router.get("")
def list_videos(
    media_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Video)
    if media_type in {"video", "image"}:
        query = query.filter(Video.media_type == media_type)
    total = query.count()
    videos = query.order_by(Video.uploaded_at.desc()).offset(offset).limit(min(limit, 200)).all()
    return {"total": total, "items": [video_out(v) for v in videos]}


@router.get("/{video_id}")
def get_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video_out(video)


@router.delete("/{video_id}")
def delete_video(
    video_id: int,
    current_user: User = Depends(require_permission("video:delete")),
    db: Session = Depends(get_db),
):
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    job_ids = [job.id for job in video.jobs]
    if job_ids:
        # Keep generated reports but detach them from the removed jobs.
        db.query(Report).filter(Report.job_id.in_(job_ids)).update({Report.job_id: None}, synchronize_session=False)
        from app.models.models import Detection, Keyframe

        db.query(Detection).filter(Detection.job_id.in_(job_ids)).delete(synchronize_session=False)
        db.query(Keyframe).filter(Keyframe.job_id.in_(job_ids)).delete(synchronize_session=False)

    remove_tree(video.path)
    for job_id in job_ids:
        remove_tree(settings.KEYFRAME_DIR / f"job_{job_id}")
        remove_tree(settings.DETECTION_DIR / f"job_{job_id}")
        remove_tree(settings.GRADCAM_DIR / f"job_{job_id}")

    db.delete(video)
    db.commit()
    return {"message": f"Video and {len(job_ids)} processing job(s) deleted"}


@router.get("/{video_id}/file")
def get_video_file(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    video = db.get(Video, video_id)
    if not video or not Path(video.path).exists():
        raise HTTPException(status_code=404, detail="File not found")
    from fastapi.responses import FileResponse

    return FileResponse(video.path, filename=video.original_filename)
