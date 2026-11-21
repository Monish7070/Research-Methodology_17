"""Member 2 - YOLO11n infrastructure defect detection.

Uses the custom-trained three-class model (crack, garbage, pothole).
The JSON record schema is preserved: image -> detections -> class_name,
confidence, bbox, source.

The model is loaded once per processing job / backend worker: `load_model()`
returns a cached Ultralytics instance and `analyze_images(..., model=...)`
reuses it instead of reloading weights for every image.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import cv2

_MODEL_CACHE: dict[str, object] = {}


def load_model(weights):
    """Load (and cache) the trained YOLO model for a given weights path."""
    key = str(Path(weights).resolve())
    if key not in _MODEL_CACHE:
        from ultralytics import YOLO

        _MODEL_CACHE[key] = YOLO(key)
    return _MODEL_CACHE[key]


def demo_detections(image_path, labels_csv):
    out = []
    if not labels_csv or not Path(labels_csv).exists():
        return out
    with open(labels_csv, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if Path(r["image"]).name == Path(image_path).name:
                out.append(
                    {
                        "class_name": r["class_name"],
                        "confidence": float(r["confidence"]),
                        "bbox": None,
                        "source": "draft-label",
                    }
                )
    return out


def yolo_detections(image_path, weights=None, conf=0.25, model=None, imgsz=640):
    if model is None:
        if not weights:
            raise ValueError("weights or model is required for yolo detection")
        model = load_model(weights)

    result = model.predict(source=str(image_path), conf=conf, imgsz=imgsz, verbose=False)[0]
    out = []
    if result.boxes is not None:
        for b in result.boxes:
            cid = int(b.cls.item())
            out.append(
                {
                    "class_name": result.names[cid],
                    "confidence": float(b.conf.item()),
                    "bbox": [float(x) for x in b.xyxy[0].tolist()],
                    "source": "yolo",
                }
            )
    return out


def analyze_images(
    image_dir,
    mode="yolo",
    labels_csv=None,
    weights=None,
    conf=0.25,
    model=None,
    imgsz=640,
    progress_cb=None,
):
    p = Path(image_dir)
    exts = {".jpg", ".jpeg", ".png", ".bmp"}
    results = []
    images = sorted(x for x in p.iterdir() if x.suffix.lower() in exts)
    total = len(images)

    for index, img_path in enumerate(images, start=1):
        if cv2.imread(str(img_path)) is None:
            print("Skipping unreadable image:", img_path)
            continue
        if mode == "demo":
            dets = demo_detections(img_path, labels_csv)
        elif mode == "yolo":
            if model is None and not weights:
                raise ValueError("--weights required for yolo mode")
            dets = yolo_detections(img_path, weights, conf, model=model, imgsz=imgsz)
        else:
            raise ValueError("mode must be demo or yolo")

        results.append({"image": img_path.name, "detections": dets, "path": str(img_path)})
        print(f"{img_path.name}: {len(dets)} detection(s)")

        if progress_cb is not None:
            progress_cb(index, total)

    return results


def write_detections_json(results, out_path):
    payload = [{"image": r["image"], "detections": r["detections"]} for r in results]
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return out


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--images", required=True)
    p.add_argument("--mode", choices=["demo", "yolo"], default="yolo")
    p.add_argument("--labels", default="data/draft_labels.csv")
    p.add_argument("--weights", required=True)
    p.add_argument("--conf", type=float, default=0.25)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--out", default="data/detections.json")
    a = p.parse_args()
    res = analyze_images(a.images, a.mode, a.labels, a.weights, a.conf, imgsz=a.imgsz)
    write_detections_json(res, a.out)
    print("Saved:", a.out)
