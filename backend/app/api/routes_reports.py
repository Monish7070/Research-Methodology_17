"""Report generation and download routes."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.serializers import report_out
from app.core.deps import get_current_user, require_permission
from app.database.db import get_db
from app.models.models import Detection, ProcessingJob, Report, User
from app.schemas.schemas import ReportGenerateRequest
from app.services import reports as report_service

router = APIRouter(prefix="/reports", tags=["Reports"])


def _parse_date(value: str | None, fallback: datetime) -> datetime:
    if not value:
        return fallback
    try:
        return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid date '{value}'. Use YYYY-MM-DD.")


@router.get("")
def list_reports(
    report_type: str | None = None,
    limit: int = Query(default=100, ge=1, le=300),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Report)
    if report_type and report_type != "all":
        query = query.filter(Report.report_type == report_type)
    items = query.order_by(Report.created_at.desc()).limit(limit).all()
    return {"total": len(items), "items": [report_out(r) for r in items]}


@router.post("/generate", status_code=201)
def generate_report(
    payload: ReportGenerateRequest,
    current_user: User = Depends(require_permission("report:generate")),
    db: Session = Depends(get_db),
):
    try:
        if payload.report_type == "defect":
            if not payload.detection_id:
                raise HTTPException(status_code=422, detail="detection_id is required for a defect report")
            detection = db.get(Detection, payload.detection_id)
            if not detection:
                raise HTTPException(status_code=404, detail="Detection not found")
            report = report_service.generate_defect_report(db, detection, current_user.id)

        elif payload.report_type == "job":
            if not payload.job_id:
                raise HTTPException(status_code=422, detail="job_id is required for a processing report")
            job = db.get(ProcessingJob, payload.job_id)
            if not job:
                raise HTTPException(status_code=404, detail="Processing job not found")
            if job.status != "completed":
                raise HTTPException(
                    status_code=409,
                    detail=f"Job #{job.id} is {job.status}; only completed jobs can be reported",
                )
            report = report_service.generate_processing_report(db, job, current_user.id)

        else:
            now = datetime.now(timezone.utc)
            if payload.report_type == "daily":
                default_start = now - timedelta(days=1)
                default_end = now
            elif payload.report_type == "weekly":
                default_start = now - timedelta(days=7)
                default_end = now
            else:
                default_start = now - timedelta(days=30)
                default_end = now

            start = _parse_date(payload.start_date, default_start)
            end = _parse_date(payload.end_date, default_end)
            if start >= end:
                raise HTTPException(status_code=422, detail="start_date must be before end_date")
            report = report_service.generate_period_report(
                db, payload.report_type, start, end, current_user.id
            )
    except HTTPException:
        raise

    return report_out(report)


@router.get("/download/{report_id}")
def download_report(
    report_id: int,
    format: str = Query(default="pdf", pattern="^(pdf|csv)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    path = report.pdf_path if format == "pdf" else report.csv_path
    if not path or not Path(path).exists():
        raise HTTPException(status_code=410, detail=f"The {format.upper()} file for this report is missing")

    media_type = "application/pdf" if format == "pdf" else "text/csv"
    filename = Path(path).name
    return FileResponse(path, media_type=media_type, filename=filename)


@router.delete("/{report_id}")
def delete_report(
    report_id: int,
    current_user: User = Depends(require_permission("settings:manage")),
    db: Session = Depends(get_db),
):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    for path in (report.pdf_path, report.csv_path):
        if path:
            Path(path).unlink(missing_ok=True)
    db.delete(report)
    db.commit()
    return {"message": "Report deleted"}
