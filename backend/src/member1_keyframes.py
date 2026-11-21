"""Member 1 - SSIM-based keyframe extraction.

Preserves the tested implementation (SSIM threshold 0.92, temporal gap 10).
Extended only with progress callbacks and a list of saved frames so the backend
can persist keyframe metadata without re-scanning the directory.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
from skimage.metrics import structural_similarity as ssim


def extract_keyframes(
    video_path,
    output_dir,
    threshold=0.92,
    resize_width=320,
    temporal_gap=10,
    progress_cb=None,
    stride=1,
):
    # ``stride`` decodes every frame but only runs the SSIM comparison (and can
    # only keep a keyframe) every Nth frame. Fleet recordings are long, so a
    # stride is the cheap way to bound extraction cost without re-encoding.
    stride = max(1, int(stride or 1))
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(video_path))

    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    # Browser-recorded WebM (and some live DVR containers) have no frame index and
    # report a placeholder count. Treat out-of-range values as unknown so the
    # progress ratio stays meaningful; timestamps fall back to zero.
    if not 0 < fps <= 240:
        fps = 0.0

    if total_frames <= 0 or total_frames > 5_000_000:
        total_frames = 0

    prev = None
    last_saved_idx = -temporal_gap
    idx = saved = 0
    saved_frames = []
    first_frame_size = None

    while True:
        ok, frame = cap.read()

        if not ok:
            break

        frame_index = idx
        idx += 1

        if frame_index % stride != 0:
            continue

        if first_frame_size is None:
            first_frame_size = (int(frame.shape[1]), int(frame.shape[0]))

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        scale = resize_width / gray.shape[1]

        small = cv2.resize(
            gray,
            (
                resize_width,
                max(1, int(gray.shape[0] * scale)),
            ),
        )

        keep = False

        if prev is None:
            keep = True

        elif frame_index - last_saved_idx >= temporal_gap:
            score = ssim(prev, small, data_range=255)
            keep = score < threshold

        if keep:
            t = frame_index / fps if fps > 0 else 0

            filename = output_dir / f"frame_{frame_index:06d}_t{t:.2f}.jpg"

            cv2.imwrite(str(filename), frame)

            saved += 1
            last_saved_idx = frame_index
            saved_frames.append(
                {
                    "filename": filename.name,
                    "path": str(filename),
                    "frame_index": frame_index,
                    "timestamp_seconds": round(t, 3),
                    "width": int(frame.shape[1]),
                    "height": int(frame.shape[0]),
                }
            )

        prev = small

        if progress_cb is not None and idx % 50 == 0:
            ratio = (idx / total_frames) if total_frames else 0.0
            progress_cb(min(99, int(ratio * 100)), idx, saved)

    cap.release()

    reduction = ((idx - saved) / idx) * 100 if idx > 0 else 0

    return {
        "frames_read": idx,
        "frames_analysed": idx // stride if stride else idx,
        "frame_stride": stride,
        "keyframes_saved": saved,
        "reduction_percent": round(reduction, 2),
        "temporal_gap": temporal_gap,
        "threshold": threshold,
        "fps": round(float(fps or 0.0), 3),
        "duration_seconds": round(idx / fps, 2) if fps else 0.0,
        "frame_width": first_frame_size[0] if first_frame_size else None,
        "frame_height": first_frame_size[1] if first_frame_size else None,
        "saved_frames": saved_frames,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument("--video", required=True)
    parser.add_argument("--out", default="data/keyframes")
    parser.add_argument("--threshold", type=float, default=0.92)
    parser.add_argument("--gap", type=int, default=10)
    parser.add_argument("--stride", type=int, default=1)

    args = parser.parse_args()

    result = extract_keyframes(
        args.video,
        args.out,
        args.threshold,
        temporal_gap=args.gap,
        stride=args.stride,
    )
    result.pop("saved_frames", None)
    print(result)
