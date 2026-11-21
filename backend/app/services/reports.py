"""PDF / CSV report generation from stored pipeline data."""

from __future__ import annotations

import csv
import logging
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.config import settings
from app.models.models import Detection, PriorityScore, ProcessingJob, Report, Video
from app.services.storage import relative_to_backend

logger = logging.getLogger("urbanvision.reports")

STATUS_LABELS = {
    "newly_detected": "Newly detected",
    "pending_review": "Pending review",
    "approved": "Approved",
    "assigned": "Assigned",
    "in_progress": "In progress",
    "resolved": "Resolved",
    "rejected": "Rejected",
}

PRIORITY_COLORS = {
    "high": colors.HexColor("#dc2626"),
    "medium": colors.HexColor("#d97706"),
    "low": colors.HexColor("#059669"),
}


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="UVTitle", parent=styles["Title"], fontSize=20, textColor=colors.HexColor("#0b2545")))
    styles.add(ParagraphStyle(name="UVSub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#475569")))
    styles.add(ParagraphStyle(name="UVH2", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor("#0b2545"), spaceBefore=14, spaceAfter=6))
    styles.add(ParagraphStyle(name="UVBody", parent=styles["Normal"], fontSize=9, leading=13))
    styles.add(ParagraphStyle(name="UVCell", parent=styles["Normal"], fontSize=8, leading=10))
    return styles


def _table(data, widths=None, header=True):
    table = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0b2545")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ]
    table.setStyle(TableStyle(style))
    return table


def _safe_image(path: str | None, width_mm=80):
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    try:
        from reportlab.lib.utils import ImageReader

        reader = ImageReader(str(p))
        iw, ih = reader.getSize()
        height = width_mm * mm * ih / max(iw, 1)
        return Image(str(p), width=width_mm * mm, height=height)
    except Exception:
        return None


def _report_paths(report_type: str) -> tuple[Path, Path]:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    settings.REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stem = f"{report_type}_{stamp}"
    return settings.REPORT_DIR / f"{stem}.pdf", settings.REPORT_DIR / f"{stem}.csv"


def _write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("message\nNo records for this report\n", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _detection_row(detection: Detection) -> dict:
    score = detection.priority
    location = detection.location
    return {
        "defect_id": f"DEF-{detection.id:05d}",
        "frame": detection.frame_name,
        "category": detection.class_name,
        "confidence": round(detection.confidence, 4),
        "priority_score": round(score.total_score, 2) if score else "",
        "priority": score.category if score else "",
        "maintenance_status": STATUS_LABELS.get(detection.maintenance_status, detection.maintenance_status),
        "latitude": location.latitude if location else "",
        "longitude": location.longitude if location else "",
        "location_label": location.label if location else "",
        "detected_at": detection.created_at.isoformat() if detection.created_at else "",
    }


def generate_processing_report(db, job: ProcessingJob, created_by_id: int | None = None) -> Report:
    video = db.get(Video, job.video_id)
    detections = (
        db.query(Detection).filter(Detection.job_id == job.id).order_by(Detection.confidence.desc()).all()
    )
    scores = [d.priority for d in detections if d.priority]
    breakdown: dict[str, int] = {}
    for detection in detections:
        breakdown[detection.class_name] = breakdown.get(detection.class_name, 0) + 1
    distribution: dict[str, int] = {"low": 0, "medium": 0, "high": 0}
    for score in scores:
        distribution[score.category] = distribution.get(score.category, 0) + 1

    high_cases = [d for d in detections if d.priority and d.priority.category == "high"]
    pdf_path, csv_path = _report_paths("video_processing")

    summary = {
        "job_id": job.id,
        "video": video.original_filename if video else None,
        "frames_read": job.frames_read,
        "keyframes": job.keyframes_saved,
        "reduction_percent": job.reduction_percent,
        "detections": len(detections),
        "breakdown": breakdown,
        "priority_distribution": distribution,
        "average_confidence": round(
            sum(d.confidence for d in detections) / len(detections), 4
        ) if detections else 0,
        "high_priority": len(high_cases),
    }

    styles = _styles()
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Urban Vision AI - Processing Report - Job {job.id}",
    )
    story = [
        Paragraph("URBAN VISION AI", styles["UVTitle"]),
        Paragraph("AI-Driven Multi-Task Urban Infrastructure Monitoring", styles["UVSub"]),
        Paragraph(f"Video Processing Report - Session #{job.id}", styles["UVH2"]),
        Spacer(1, 6),
    ]

    meta = [
        ["Project", "URBAN VISION AI - Urban Infrastructure Monitoring and Maintenance Prioritization"],
        ["Processing session ID", str(job.id)],
        ["Video filename", video.original_filename if video else "-"],
        ["Processing status", job.status.title()],
        ["Completed at", job.finished_at.strftime("%Y-%m-%d %H:%M UTC") if job.finished_at else "-"],
        ["Processing duration", f"{job.duration_seconds or 0:.1f} s"],
        ["SSIM threshold / gap", f"{job.threshold} / {job.temporal_gap}"],
    ]
    story.append(_table(meta, widths=[55 * mm, 115 * mm], header=False))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Extraction and detection summary", styles["UVH2"]))
    summary_rows = [
        ["Metric", "Value"],
        ["Frames read", str(job.frames_read)],
        ["Keyframes extracted", str(job.keyframes_saved)],
        ["Frame reduction", f"{job.reduction_percent}%"],
        ["Total detections", str(len(detections))],
        ["Average detection confidence", f"{summary['average_confidence'] * 100:.1f}%"],
        ["High priority cases", str(len(high_cases))],
        ["LayerCAM explanations generated", str(job.layercam_count)],
    ]
    story.append(_table(summary_rows, widths=[80 * mm, 90 * mm]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Detection breakdown by class", styles["UVH2"]))
    class_rows = [["Class", "Detections"]]
    for name, count in sorted(breakdown.items()):
        class_rows.append([name.title(), str(count)])
    if not breakdown:
        class_rows.append(["No detections", "0"])
    story.append(_table(class_rows, widths=[80 * mm, 90 * mm]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Priority distribution", styles["UVH2"]))
    priority_rows = [["Category", "Count"]]
    for name in ("high", "medium", "low"):
        priority_rows.append([name.title(), str(distribution.get(name, 0))])
    story.append(_table(priority_rows, widths=[80 * mm, 90 * mm]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Detected defects", styles["UVH2"]))
    defect_rows = [["Defect ID", "Frame", "Class", "Conf.", "Priority", "Score", "Status"]]
    for detection in detections[:120]:
        defect_rows.append(
            [
                f"DEF-{detection.id:05d}",
                detection.frame_name[:34],
                detection.class_name.title(),
                f"{detection.confidence * 100:.1f}%",
                detection.priority.category.title() if detection.priority else "-",
                f"{detection.priority.total_score:.1f}" if detection.priority else "-",
                STATUS_LABELS.get(detection.maintenance_status, detection.maintenance_status),
            ]
        )
    if not detections:
        defect_rows.append(["-", "No defects detected", "-", "-", "-", "-", "-"])
    story.append(_table(defect_rows, widths=[22 * mm, 52 * mm, 24 * mm, 18 * mm, 22 * mm, 18 * mm, 30 * mm]))

    explained = [d for d in high_cases if d.explanation][:6]
    if explained:
        story.append(PageBreak())
        story.append(Paragraph("LayerCAM explanations - high priority cases", styles["UVH2"]))
        for detection in explained:
            story.append(
                Paragraph(
                    f"DEF-{detection.id:05d} | {detection.class_name} | "
                    f"confidence {detection.confidence * 100:.1f}% | "
                    f"priority {detection.priority.total_score:.1f} ({detection.priority.category}) | "
                    f"LayerCAM layer {detection.explanation.feature_layer}",
                    styles["UVBody"],
                )
            )
            images = []
            for path, caption in (
                (detection.explanation.original_path, "Original"),
                (detection.explanation.overlay_path, "LayerCAM overlay"),
            ):
                image = _safe_image(path, 78)
                if image:
                    images.append(image)
                else:
                    images.append(Paragraph(caption, styles["UVCell"]))
            row = Table([[images[0], images[1]]], colWidths=[85 * mm, 85 * mm])
            row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
            story.append(row)
            story.append(Spacer(1, 8))

    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Priority model: P = 100 x (0.40S + 0.20C + 0.25R + 0.15L). "
            "Component definitions are configurable in Settings and are provisional project values.",
            styles["UVSub"],
        )
    )
    story.append(
        Paragraph(
            "Explanations use LayerCAM (spatially varying positive gradients), not standard Grad-CAM.",
            styles["UVSub"],
        )
    )

    doc.build(story)

    rows = [_detection_row(d) for d in detections]
    _write_csv(csv_path, rows)

    report = Report(
        report_type="job",
        title=f"Video processing report - {video.original_filename if video else 'job'} (#{job.id})",
        job_id=job.id,
        period_start=job.started_at,
        period_end=job.finished_at,
        pdf_path=str(pdf_path),
        csv_path=str(csv_path),
        summary=summary,
        created_by_id=created_by_id or job.created_by_id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    logger.info("Processing report %s generated at %s", report.id, pdf_path)
    return report


def generate_defect_report(db, detection: Detection, created_by_id: int | None = None) -> Report:
    pdf_path, csv_path = _report_paths(f"defect_{detection.id}")
    styles = _styles()
    video = detection.job.video if detection.job else None
    score = detection.priority

    story = [
        Paragraph("URBAN VISION AI", styles["UVTitle"]),
        Paragraph("Individual Defect Report", styles["UVH2"]),
        Spacer(1, 6),
    ]
    meta = [
        ["Defect ID", f"DEF-{detection.id:05d}"],
        ["Category", detection.class_name.title()],
        ["Confidence", f"{detection.confidence * 100:.2f}%"],
        ["Frame", detection.frame_name],
        ["Processing job", str(detection.job_id)],
        ["Video", video.original_filename if video else "-"],
        ["Detected at", detection.created_at.strftime("%Y-%m-%d %H:%M UTC") if detection.created_at else "-"],
        ["Bounding box", ", ".join(f"{v:.1f}" for v in detection.bbox) if detection.bbox else "-"],
        ["Maintenance status", STATUS_LABELS.get(detection.maintenance_status, detection.maintenance_status)],
        [
            "Location",
            f"{detection.location.latitude:.6f}, {detection.location.longitude:.6f}"
            if detection.location
            else "Location unavailable",
        ],
    ]
    story.append(_table(meta, widths=[55 * mm, 115 * mm]))
    story.append(Spacer(1, 10))

    if score:
        story.append(Paragraph("Maintenance priority", styles["UVH2"]))
        story.append(
            Paragraph(
                f"<b>{score.total_score:.2f} / 100</b> - {score.category.title()} priority",
                styles["UVBody"],
            )
        )
        rows = [
            ["Component", "Normalized", "Contribution"],
            ["Severity (S)", f"{score.severity:.3f}", f"{score.severity_contribution:.2f}"],
            ["Confidence (C)", f"{score.confidence_component:.3f}", f"{score.confidence_contribution:.2f}"],
            ["Risk (R)", f"{score.risk:.3f}", f"{score.risk_contribution:.2f}"],
            ["Location (L)", f"{score.location_component:.3f}", f"{score.location_contribution:.2f}"],
            ["Total", "", f"{score.total_score:.2f}"],
        ]
        story.append(_table(rows, widths=[60 * mm, 55 * mm, 55 * mm]))
        story.append(Spacer(1, 10))

    explanation = detection.explanation
    if explanation:
        story.append(Paragraph("LayerCAM explanation", styles["UVH2"]))
        story.append(
            Paragraph(
                f"Method: LayerCAM | feature layer {explanation.feature_layer} | "
                f"prediction anchor {explanation.prediction_index} | "
                f"target score {explanation.target_score:.4f} | IoU {explanation.matching_iou:.3f}",
                styles["UVBody"],
            )
        )
        images = []
        for path in (explanation.original_path, explanation.raw_cam_path, explanation.overlay_path):
            image = _safe_image(path, 55)
            if image:
                images.append(image)
        if images:
            story.append(Table([images], colWidths=[57 * mm] * len(images)))
        if explanation.warning:
            story.append(Paragraph(f"Warning: {explanation.warning}", styles["UVCell"]))
    else:
        story.append(Paragraph("No LayerCAM explanation generated for this defect.", styles["UVBody"]))

    doc = SimpleDocTemplate(str(pdf_path), pagesize=A4, title=f"Defect DEF-{detection.id:05d}")
    doc.build(story)

    _write_csv(csv_path, [_detection_row(detection)])

    report = Report(
        report_type="defect",
        title=f"Defect report DEF-{detection.id:05d} ({detection.class_name})",
        job_id=detection.job_id,
        detection_id=detection.id,
        pdf_path=str(pdf_path),
        csv_path=str(csv_path),
        summary=_detection_row(detection),
        created_by_id=created_by_id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def generate_period_report(
    db,
    report_type: str,
    start: datetime,
    end: datetime,
    created_by_id: int | None = None,
) -> Report:
    detections = (
        db.query(Detection)
        .filter(Detection.created_at >= start, Detection.created_at <= end)
        .order_by(Detection.created_at.desc())
        .all()
    )
    breakdown: dict[str, int] = {}
    distribution: dict[str, int] = {"low": 0, "medium": 0, "high": 0}
    for detection in detections:
        breakdown[detection.class_name] = breakdown.get(detection.class_name, 0) + 1
        if detection.priority:
            distribution[detection.priority.category] = distribution.get(detection.priority.category, 0) + 1

    pdf_path, csv_path = _report_paths(report_type)
    styles = _styles()
    story = [
        Paragraph("URBAN VISION AI", styles["UVTitle"]),
        Paragraph(f"{report_type.title()} Infrastructure Report", styles["UVH2"]),
        Paragraph(f"{start:%Y-%m-%d} to {end:%Y-%m-%d}", styles["UVSub"]),
        Spacer(1, 8),
        Paragraph(f"Total defects: {len(detections)}", styles["UVBody"]),
        Spacer(1, 6),
    ]

    class_rows = [["Class", "Detections"]]
    for name, count in sorted(breakdown.items()):
        class_rows.append([name.title(), str(count)])
    if not breakdown:
        class_rows.append(["No detections", "0"])
    story.append(_table(class_rows, widths=[80 * mm, 90 * mm]))
    story.append(Spacer(1, 8))

    priority_rows = [["Priority", "Count"]]
    for name in ("high", "medium", "low"):
        priority_rows.append([name.title(), str(distribution.get(name, 0))])
    story.append(_table(priority_rows, widths=[80 * mm, 90 * mm]))
    story.append(Spacer(1, 10))

    defect_rows = [["Defect ID", "Detected", "Frame", "Class", "Conf.", "Priority", "Score", "Status"]]
    for detection in detections[:150]:
        defect_rows.append(
            [
                f"DEF-{detection.id:05d}",
                detection.created_at.strftime("%Y-%m-%d") if detection.created_at else "",
                detection.frame_name[:28],
                detection.class_name.title(),
                f"{detection.confidence * 100:.1f}%",
                detection.priority.category.title() if detection.priority else "-",
                f"{detection.priority.total_score:.1f}" if detection.priority else "-",
                STATUS_LABELS.get(detection.maintenance_status, detection.maintenance_status),
            ]
        )
    if not detections:
        defect_rows.append(["-", "-", "No defects in this period", "-", "-", "-", "-", "-"])
    story.append(_table(defect_rows, widths=[20 * mm, 20 * mm, 40 * mm, 20 * mm, 16 * mm, 18 * mm, 14 * mm, 26 * mm]))

    doc = SimpleDocTemplate(str(pdf_path), pagesize=A4, title=f"Urban Vision AI {report_type} report")
    doc.build(story)

    _write_csv(csv_path, [_detection_row(d) for d in detections])

    report = Report(
        report_type=report_type,
        title=f"{report_type.title()} report {start:%Y-%m-%d} to {end:%Y-%m-%d}",
        period_start=start,
        period_end=end,
        pdf_path=str(pdf_path),
        csv_path=str(csv_path),
        summary={
            "total": len(detections),
            "breakdown": breakdown,
            "priority_distribution": distribution,
        },
        created_by_id=created_by_id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
