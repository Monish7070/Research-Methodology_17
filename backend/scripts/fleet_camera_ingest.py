"""Vehicle-camera ingestion client for Urban Vision AI.

Records short clips from a vehicle-mounted or fleet-dashcam source and pushes
them into the existing upload -> processing pipeline. Nothing in the backend
changes: this is just an unattended replacement for a person dragging files
into the Video Upload page.

Supported sources (OpenCV VideoCapture):
  * USB / laptop camera          --source 0
  * IP / RTSP / MJPEG camera     --source rtsp://user:pass@192.168.1.64:554/Streaming/Channels/101
  * Recorded dashcam segment     --source D:/fleet/shift_2026-11-20.mp4

Examples
--------
# Live roof camera on a bus, 30 s clips at 10 fps, upload + process:
python scripts/fleet_camera_ingest.py \
    --source "https://10.188.54.50:8080" \
    --email officer@urbanvision.ai --password "Urban@123" \
    --location-label "Route 12 - Bus AR-01" --clip-seconds 30 --fps 10 \
    --image-size 1280 --frame-stride 3 --gps-port COM4

# Offline test against a recorded clip, no server calls:
python scripts/fleet_camera_ingest.py --source tests/assets/sample_road.mp4 \
    --clip-seconds 2 --dry-run

Run it on the machine that can reach both the camera and the API. The backend
must be running first (uvicorn app.main:app).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2

try:  # httpx ships with the backend requirements
    import httpx
except ImportError:  # pragma: no cover - dependency guard
    httpx = None  # type: ignore[assignment]


# --------------------------------------------------------------------------- #
# camera / GPS helpers
# --------------------------------------------------------------------------- #
def parse_source(value: str) -> int | str:
    """Turn "0" into a webcam index, leave files and URLs as strings."""
    if value.isdigit():
        return int(value)
    return value


def open_capture(source: int | str) -> cv2.VideoCapture:
    # CAP_FFMPEG handles RTSP/HTTP streams and files; the default backend is
    # more reliable for local USB cameras, so try it for bare indices.
    if isinstance(source, int):
        cap = cv2.VideoCapture(source)
    else:
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            cap.release()
            cap = cv2.VideoCapture(source)
    return cap


@dataclass
class GpsFix:
    latitude: float
    longitude: float
    at: float  # time.monotonic() of the fix


class NmeaGps:
    """Reads $GPRMC/$GPGGA sentences from a serial GPS receiver.

    Only used when --gps-port is given; pyserial is optional so the client
    still works with a fixed --lat/--lon or with no coordinates at all.
    """

    def __init__(self, port: str, baud: int = 9600, max_age: float = 30.0) -> None:
        try:
            import serial  # type: ignore[import-not-found]
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise SystemExit(
                "--gps-port needs pyserial. Install it with: pip install pyserial"
            ) from exc
        self._serial = serial.Serial(port, baud, timeout=1)
        self._max_age = max_age
        self._fix: GpsFix | None = None

    def poll(self) -> GpsFix | None:
        line = self._serial.readline().decode("ascii", errors="ignore").strip()
        if line.startswith(("$GPRMC", "$GNRMC", "$GPGGA", "$GNGGA")):
            parsed = self._parse(line)
            if parsed:
                self._fix = parsed
        if self._fix and time.monotonic() - self._fix.at > self._max_age:
            return None
        return self._fix

    @staticmethod
    def _parse(sentence: str) -> GpsFix | None:
        parts = sentence.split(",")
        try:
            if sentence.startswith(("$GPRMC", "$GNRMC")):
                if parts[2] != "A":  # A = valid fix
                    return None
                lat, lon = parts[3], parts[5]
                lat_dir, lon_dir = parts[4], parts[6]
            else:  # $GPGGA / $GNGGA
                if parts[6] == "0":
                    return None
                lat, lon = parts[2], parts[4]
                lat_dir, lon_dir = parts[3], parts[5]
            if not lat or not lon:
                return None
            latitude = NmeaGps._to_degrees(lat, lat_dir)
            longitude = NmeaGps._to_degrees(lon, lon_dir)
            return GpsFix(latitude, longitude, time.monotonic())
        except (IndexError, ValueError):
            return None

    @staticmethod
    def _to_degrees(raw: str, hemisphere: str) -> float:
        # NMEA is ddmm.mmmm / dddmm.mmmm
        split = raw.index(".") - 2
        degrees = float(raw[:split])
        minutes = float(raw[split:])
        value = degrees + minutes / 60.0
        return -value if hemisphere in {"S", "W"} else value


# --------------------------------------------------------------------------- #
# API client
# --------------------------------------------------------------------------- #
class ApiClient:
    def __init__(self, base_url: str, token: str | None, email: str | None, password: str | None) -> None:
        if httpx is None:
            raise SystemExit("httpx is required. Install backend requirements first.")
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(base_url=self.base_url, timeout=120.0)
        if token:
            self._client.headers["Authorization"] = f"Bearer {token}"
        elif email and password:
            response = self._client.post("/api/auth/login", json={"email": email, "password": password})
            if response.status_code != 200:
                raise SystemExit(f"Login failed ({response.status_code}): {response.text}")
            self._client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
        else:
            raise SystemExit("Provide --token, or --email and --password.")

    def health(self) -> bool:
        try:
            return self._client.get("/api/system/health").status_code == 200
        except httpx.HTTPError:
            return False

    def upload(
        self,
        clip: Path,
        location_label: str,
        latitude: float | None,
        longitude: float | None,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {"location_label": location_label}
        if latitude is not None and longitude is not None:
            data["latitude"] = f"{latitude:.6f}"
            data["longitude"] = f"{longitude:.6f}"
        with clip.open("rb") as handle:
            files = {"file": (clip.name, handle, "video/mp4")}
            response = self._client.post("/api/videos/upload", files=files, data=data)
        if response.status_code != 201:
            raise RuntimeError(f"Upload failed ({response.status_code}): {response.text}")
        return response.json()

    def start_processing(self, video_id: int, options: dict[str, Any]) -> dict[str, Any]:
        response = self._client.post(f"/api/processing/start/{video_id}", json=options)
        if response.status_code != 202:
            raise RuntimeError(f"Could not start processing ({response.status_code}): {response.text}")
        return response.json()

    def wait_for_job(self, job_id: int, poll_seconds: float = 5.0, timeout: float = 3600.0) -> dict[str, Any]:
        started = time.monotonic()
        while time.monotonic() - started < timeout:
            response = self._client.get(f"/api/processing/{job_id}/status")
            if response.status_code != 200:
                raise RuntimeError(f"Status check failed ({response.status_code}): {response.text}")
            job = response.json()
            print(
                f"    job #{job_id}: {job.get('status')} {job.get('progress')}% "
                f"({job.get('current_stage')})",
                flush=True,
            )
            if job.get("status") in {"completed", "failed"}:
                return job
            time.sleep(poll_seconds)
        raise TimeoutError(f"Job #{job_id} did not finish within {timeout:.0f}s")

    def job_summary(self, job_id: int) -> dict[str, Any]:
        response = self._client.get(f"/api/processing/{job_id}/results")
        if response.status_code != 200:
            return {}
        return response.json().get("summary", {})

    def close(self) -> None:
        self._client.close()


# --------------------------------------------------------------------------- #
# recording
# --------------------------------------------------------------------------- #
def record_clip(
    cap: cv2.VideoCapture,
    out_dir: Path,
    clip_seconds: float,
    target_fps: float,
    gps: NmeaGps | None,
    label: str,
) -> tuple[Path | None, float, float | None, float | None]:
    """Grab one clip. Returns (path, frames_written, lat, lon)."""
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_label = "".join(c if c.isalnum() or c in "-_" else "_" for c in label)[:40]
    base = out_dir / f"{stamp}_{safe_label or 'clip'}"

    writer: cv2.VideoWriter | None = None
    path: Path | None = None
    written = 0
    interval = 1.0 / max(target_fps, 1.0)
    last_written = 0.0
    deadline = time.monotonic() + clip_seconds
    fix: GpsFix | None = None

    try:
        while time.monotonic() < deadline:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            if gps is not None:
                reading = gps.poll()
                if reading:
                    fix = reading
            now = time.monotonic()
            if now - last_written < interval:
                continue
            last_written = now

            if writer is None:
                path = base.with_suffix(".mp4")
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                writer = cv2.VideoWriter(str(path), fourcc, target_fps, (width, height))
                if not writer.isOpened():
                    raise SystemExit("Could not open a video writer for the clip")
            writer.write(frame)
            written += 1
    finally:
        if writer is not None:
            writer.release()

    if written < 2:
        if path and path.exists():
            path.unlink(missing_ok=True)
        return None, written, None, None
    return path, written, (fix.latitude if fix else None), (fix.longitude if fix else None)


# --------------------------------------------------------------------------- #
# main loop
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Record clips from a vehicle camera and feed them to Urban Vision AI."
    )
    parser.add_argument("--source", required=True, help="camera index (0), RTSP/HTTP URL, or video file")
    parser.add_argument("--clip-seconds", type=float, default=30.0, help="length of each uploaded clip")
    parser.add_argument("--fps", type=float, default=10.0, help="frames per second written to each clip")
    parser.add_argument("--api", default="http://127.0.0.1:8000", help="backend base URL")
    parser.add_argument("--email", help="account email used to log in")
    parser.add_argument("--password", help="account password")
    parser.add_argument("--token", help="existing bearer token (instead of email/password)")
    parser.add_argument("--location-label", default="", help="label stored with the upload, e.g. 'Bus AR-01 roof cam'")
    parser.add_argument("--lat", type=float, help="fixed latitude for every clip (no GPS receiver)")
    parser.add_argument("--lon", type=float, help="fixed longitude for every clip")
    parser.add_argument("--gps-port", help="serial port of a NMEA GPS, e.g. COM4 or /dev/ttyUSB0")
    parser.add_argument("--gps-baud", type=int, default=9600)
    parser.add_argument("--no-process", action="store_true", help="upload only, do not start the AI pipeline")
    parser.add_argument("--image-size", type=int, default=1280, help="YOLO inference resolution (320-1536)")
    parser.add_argument("--frame-stride", type=int, default=2, help="compare every Nth decoded frame (1-60)")
    parser.add_argument("--conf", type=float, default=0.25, help="detection confidence threshold (0-1)")
    parser.add_argument("--max-clips", type=int, default=0, help="stop after N clips (0 = run until Ctrl+C)")
    parser.add_argument("--wait", action="store_true", help="wait for each job and print detection totals")
    parser.add_argument("--keep-clips", action="store_true", help="keep the recorded clips on disk")
    parser.add_argument("--dry-run", action="store_true", help="record clips only; no API calls")
    parser.add_argument("--reconnect-delay", type=float, default=5.0, help="seconds before reopening a lost camera")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if not 1 <= args.fps <= 60:
        raise SystemExit("--fps must be between 1 and 60")
    if not 1 <= args.frame_stride <= 60:
        raise SystemExit("--frame-stride must be between 1 and 60")
    if not 320 <= args.image_size <= 1536:
        raise SystemExit("--image-size must be between 320 and 1536")

    api: ApiClient | None = None
    if not args.dry_run:
        api = ApiClient(args.api, args.token, args.email, args.password)
        if not api.health():
            print(f"Warning: {args.api} is not answering /api/system/health", file=sys.stderr)

    gps = NmeaGps(args.gps_port, args.gps_baud) if args.gps_port else None
    source = parse_source(args.source)
    out_dir = Path(tempfile.mkdtemp(prefix="uv_clips_"))
    options = {
        "image_size": args.image_size,
        "frame_stride": args.frame_stride,
        "conf_threshold": args.conf,
    }

    print(f"Source: {source}")
    print(f"Clips: {args.clip_seconds:.0f}s @ {args.fps:.0f} fps -> {out_dir}")
    if args.dry_run:
        print("Dry run: no uploads will be made")
    else:
        print(f"API: {args.api}  processing: {'off' if args.no_process else 'on'}")

    cap = open_capture(source)
    if not cap.isOpened():
        print(f"Could not open camera/source: {args.source}", file=sys.stderr)
        return 2

    clips = 0
    try:
        while args.max_clips == 0 or clips < args.max_clips:
            clip, frames, lat, lon = record_clip(
                cap, out_dir, args.clip_seconds, args.fps, gps, args.location_label or "vehicle-camera"
            )

            if clip is None:
                print("No frames captured; reopening the source", file=sys.stderr)
                cap.release()
                time.sleep(args.reconnect_delay)
                cap = open_capture(source)
                if not cap.isOpened():
                    print("Source is still unavailable; retrying", file=sys.stderr)
                continue

            clips += 1
            if lat is None:
                lat, lon = args.lat, args.lon
            where = f"{lat:.6f},{lon:.6f}" if lat is not None and lon is not None else "no GPS"

            if args.dry_run:
                print(f"[{clips}] {clip.name}: {frames} frames, {where} -> {clip}")
                if not args.keep_clips:
                    clip.unlink(missing_ok=True)
                continue

            assert api is not None
            try:
                video = api.upload(clip, args.location_label, lat, lon)
                print(
                    f"[{clips}] uploaded video #{video['id']} ({frames} frames, {where})",
                    flush=True,
                )
                if not args.no_process:
                    job = api.start_processing(video["id"], options)
                    print(f"    processing job #{job['id']} queued", flush=True)
                    if args.wait:
                        finished = api.wait_for_job(job["id"])
                        summary = api.job_summary(job["id"])
                        print(
                            f"    job #{job['id']} {finished.get('status')}: "
                            f"{summary.get('detections', 0)} detection(s), "
                            f"{finished.get('high_priority_count', 0)} high priority",
                            flush=True,
                        )
            except Exception as exc:  # keep the vehicle recording through transient errors
                print(f"[{clips}] upload failed: {exc}", file=sys.stderr)
            finally:
                if not args.keep_clips:
                    clip.unlink(missing_ok=True)
    except KeyboardInterrupt:
        print("\nStopped by user")
    finally:
        cap.release()
        if api is not None:
            api.close()
        if not args.keep_clips:
            shutil.rmtree(out_dir, ignore_errors=True)

    print(f"Finished after {clips} clip(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
