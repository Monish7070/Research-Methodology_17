"""Member 4 - Weighted maintenance priority scoring.

P = 100 * (0.40*S + 0.20*C + 0.25*R + 0.15*L)

S = severity component, C = confidence component, R = risk component,
L = location/impact component. All components are normalized to [0, 1].

The default class severity / risk / location values are provisional project
settings and are fully configurable (see SystemSettings "priority_config").
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

ROAD_DAMAGE_CLASSES = {"crack", "garbage", "pothole"}

DEFAULT_CONFIG = {
    "weights": {"severity": 0.40, "confidence": 0.20, "risk": 0.25, "location": 0.15},
    "class_severity": {"crack": 0.70, "garbage": 0.45, "pothole": 0.90},
    "class_risk": {"crack": 0.65, "garbage": 0.40, "pothole": 0.90},
    "location": {"verified": 1.0, "unverified": 0.35, "no_location": 0.20},
    "categories": {"low_max": 39, "medium_max": 69},
}


def get_priority_category(score, categories=None):
    categories = categories or DEFAULT_CONFIG["categories"]
    if score <= float(categories.get("low_max", 39)):
        return "low"
    if score <= float(categories.get("medium_max", 69)):
        return "medium"
    return "high"


def calculate_priority(
    detection,
    config=None,
    location_verified=False,
    has_location=False,
):
    """Compute the weighted priority score for one detection.

    `detection` needs at least class_name and confidence. Location information is
    supplied by the caller from verified GPS records; it is never inferred from
    image content.
    """
    config = config or DEFAULT_CONFIG
    weights = config.get("weights", DEFAULT_CONFIG["weights"])

    class_name = str(detection.get("class_name", "")).strip().lower()

    if class_name not in ROAD_DAMAGE_CLASSES:
        return None

    confidence = float(detection.get("confidence", 0.0))
    confidence = max(0.0, min(confidence, 1.0))

    severity = float(config.get("class_severity", {}).get(class_name, 0.5))
    risk = float(config.get("class_risk", {}).get(class_name, 0.5))

    location_cfg = config.get("location", DEFAULT_CONFIG["location"])
    if not has_location:
        location_component = float(location_cfg.get("no_location", 0.20))
    elif location_verified:
        location_component = float(location_cfg.get("verified", 1.0))
    else:
        location_component = float(location_cfg.get("unverified", 0.35))

    components = {
        "severity": max(0.0, min(severity, 1.0)),
        "confidence": confidence,
        "risk": max(0.0, min(risk, 1.0)),
        "location": max(0.0, min(location_component, 1.0)),
    }

    contributions = {
        "severity": 100 * float(weights["severity"]) * components["severity"],
        "confidence": 100 * float(weights["confidence"]) * components["confidence"],
        "risk": 100 * float(weights["risk"]) * components["risk"],
        "location": 100 * float(weights["location"]) * components["location"],
    }

    total = sum(contributions.values())
    total = max(0.0, min(total, 100.0))

    return {
        "class_name": class_name,
        "confidence": round(confidence, 4),
        "severity": round(components["severity"], 4),
        "risk": round(components["risk"], 4),
        "location_component": round(components["location"], 4),
        "severity_contribution": round(contributions["severity"], 2),
        "confidence_contribution": round(contributions["confidence"], 2),
        "risk_contribution": round(contributions["risk"], 2),
        "location_contribution": round(contributions["location"], 2),
        "priority_score": round(total, 2),
        "priority": get_priority_category(total, config.get("categories")),
        "weights": weights,
    }


def main():
    parser = argparse.ArgumentParser(description="Rank road-damage detections by maintenance priority.")
    parser.add_argument("--detections", default="data/detections.json")
    parser.add_argument("--metadata", default="")
    parser.add_argument("--out", default="data/priority_report.csv")
    args = parser.parse_args()

    detections_path = Path(args.detections)
    if not detections_path.exists():
        raise FileNotFoundError(f"Detection file not found: {detections_path}")

    image_records = json.loads(detections_path.read_text(encoding="utf-8"))

    metadata_by_image = {}
    if args.metadata and Path(args.metadata).exists():
        with Path(args.metadata).open("r", encoding="utf-8-sig", newline="") as file:
            for row in csv.DictReader(file):
                name = row.get("image") or row.get("filename")
                if name:
                    metadata_by_image[Path(name).name] = row

    rows = []
    for record in image_records:
        image_name = Path(record.get("image", "unknown")).name
        for detection in record.get("detections", []):
            result = calculate_priority(detection)
            if result is None:
                continue
            rows.append({"image": image_name, **result, "location": metadata_by_image.get(image_name, {}).get("location", "")})

    rows.sort(key=lambda row: row["priority_score"], reverse=True)

    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "image",
        "class_name",
        "confidence",
        "severity",
        "risk",
        "location_component",
        "severity_contribution",
        "confidence_contribution",
        "risk_contribution",
        "location_contribution",
        "priority_score",
        "priority",
        "location",
    ]
    with output_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    print(f"Scored detections: {len(rows)} -> {output_path.resolve()}")
    for row in rows[:20]:
        print(f"{row['priority_score']:.2f} {row['priority']:<7} {row['class_name']:<10} {row['image']}")


if __name__ == "__main__":
    main()
