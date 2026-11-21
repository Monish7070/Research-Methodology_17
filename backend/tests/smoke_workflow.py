"""End-to-end smoke test against a running backend.

Usage (from backend/, with the API running on port 8000):
    ./.venv/Scripts/python.exe tests/smoke_workflow.py

Uploads the bundled sample road video, runs the full AI pipeline, then exercises
defect review, maintenance assignment, status update and report generation.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000/api"
ASSETS = Path(__file__).parent / "assets"


def log(message: str) -> None:
    print(message, flush=True)


def main() -> int:
    client = httpx.Client(timeout=120.0)

    health = client.get(f"{BASE}/system/health")
    log(f"[1] health {health.status_code} {health.json()['status']}")

    login = client.post(
        f"{BASE}/auth/login",
        json={"email": "admin@urbanvision.ai", "password": "Urban@123"},
    )
    if login.status_code != 200:
        log(f"Login failed: {login.status_code} {login.text}")
        return 1
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    log(f"[2] login ok as {login.json()['user']['role']}")

    video_path = ASSETS / "sample_road.mp4"
    if not video_path.exists():
        log(f"Missing test asset: {video_path}")
        return 1

    with video_path.open("rb") as handle:
        upload = client.post(
            f"{BASE}/videos/upload",
            files={"file": (video_path.name, handle, "video/mp4")},
            data={"location_label": "Smoke test corridor", "latitude": "11.0168", "longitude": "76.9558"},
            headers=headers,
        )
    if upload.status_code != 201:
        log(f"Upload failed: {upload.status_code} {upload.text}")
        return 1
    video = upload.json()
    log(f"[3] uploaded video #{video['id']} ({video['size_bytes']} bytes, {video['duration_seconds']}s)")

    start = client.post(
        f"{BASE}/processing/start/{video['id']}",
        json={"threshold": 0.92, "temporal_gap": 4, "conf_threshold": 0.15, "max_layercam": 4},
        headers=headers,
    )
    if start.status_code != 202:
        log(f"Start failed: {start.status_code} {start.text}")
        return 1
    job = start.json()
    log(f"[4] job #{job['id']} queued")

    deadline = time.time() + 900
    while time.time() < deadline:
        poll = client.get(f"{BASE}/processing/{job['id']}/status", headers=headers).json()
        stage = poll.get("current_stage") or ""
        log(f"    progress {poll['progress']:>3}% stage={stage:<10} status={poll['status']}")
        if poll["status"] in {"completed", "failed"}:
            break
        time.sleep(3)

    status = client.get(f"{BASE}/processing/{job['id']}/status", headers=headers).json()
    if status["status"] != "completed":
        log(f"Pipeline did not complete: {status['status']} {status.get('error_message')}")
        for stage in status.get("stages", []):
            log(f"    {stage['label']}: {stage['status']} — {stage['message']}")
        return 1

    log("")
    for stage in status["stages"]:
        log(f"[stage] {stage['label']:<38} {stage['status']:<10} {stage['message']}")

    results = client.get(f"{BASE}/processing/{job['id']}/results", headers=headers).json()
    summary = results["summary"]
    log(f"\n[5] frames_read={summary['frames_read']} keyframes={summary['keyframes_saved']} "
        f"reduction={summary['reduction_percent']}% detections={summary['detections']} "
        f"breakdown={summary['breakdown']} layercam={summary['layercam_count']} "
        f"high={summary['high_priority']} duration={summary['duration_seconds']}s")

    if results["detections"]:
        first = results["detections"][0]
        log(f"    first detection: {first['defect_code']} {first['class_name']} "
            f"conf={first['confidence']:.3f} priority={first['priority']['total_score'] if first['priority'] else None}")
        explained = [d for d in results["detections"] if d["has_explanation"]]
        log(f"    explained detections: {len(explained)}")
        if explained:
            exp = client.get(f"{BASE}/explainability/{explained[0]['id']}", headers=headers).json()["explanation"]
            log(f"    explanation: method={exp['method']} layer={exp['feature_layer']} "
                f"anchor={exp['prediction_index']} iou={exp['matching_iou']:.3f} "
                f"heatmap_mean={exp['heatmap_stats'].get('mean'):.4f}")

        detection_id = results["detections"][0]["id"]
        review = client.put(
            f"{BASE}/defects/{detection_id}/status",
            json={"status": "approved", "comment": "Smoke test approval"},
            headers=headers,
        )
        log(f"[6] approve detection {detection_id}: {review.status_code} -> "
            f"{review.json().get('maintenance_status')}")

        task = client.post(
            f"{BASE}/maintenance",
            json={
                "detection_id": detection_id,
                "title": "Smoke test repair",
                "status": "assigned",
                "notes": "Assign to field crew",
            },
            headers=headers,
        )
        if task.status_code == 201:
            task_id = task.json()["id"]
            log(f"[7] maintenance task #{task_id} created ({task.json()['status']})")
            progress = client.put(
                f"{BASE}/maintenance/{task_id}",
                json={"status": "in_progress", "comment": "Crew dispatched"},
                headers=headers,
            )
            log(f"    -> in_progress {progress.status_code} ({progress.json().get('status')})")
            resolved = client.put(
                f"{BASE}/maintenance/{task_id}",
                json={"status": "resolved", "resolution_notes": "Patched with cold mix asphalt"},
                headers=headers,
            )
            log(f"    -> resolved {resolved.status_code} ({resolved.json().get('status')})")
            history = client.get(f"{BASE}/maintenance/history/{task_id}", headers=headers).json()
            log(f"    history entries: {len(history['history'])}")
        else:
            log(f"    task creation failed: {task.status_code} {task.text}")

    report = client.post(
        f"{BASE}/reports/generate",
        json={"report_type": "job", "job_id": job["id"]},
        headers=headers,
    )
    if report.status_code != 201:
        log(f"[8] report generation failed: {report.status_code} {report.text}")
        return 1
    report_id = report.json()["id"]
    pdf = client.get(f"{BASE}/reports/download/{report_id}?format=pdf", headers=headers)
    csv = client.get(f"{BASE}/reports/download/{report_id}?format=csv", headers=headers)
    log(f"[8] report #{report_id}: pdf={pdf.status_code} {len(pdf.content)} bytes, "
        f"csv={csv.status_code} {len(csv.content)} bytes")

    dashboard = client.get(f"{BASE}/dashboard/summary", headers=headers).json()
    analytics = client.get(f"{BASE}/dashboard/analytics?days=30", headers=headers).json()
    log(f"[9] dashboard cards: {json.dumps(dashboard['cards'])}")
    log(f"    analytics categories: {analytics['defects_by_category']}")
    log(f"    priority distribution: {analytics['priority_distribution']}")

    log("\nSMOKE WORKFLOW COMPLETED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
