"""Tests for the preserved SSIM and YOLO modules on the bundled sample assets."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from src.member1_keyframes import extract_keyframes
from src.member2_detection import analyze_images, load_model

ASSETS = Path(__file__).parent / "assets"


def test_ssim_keyframe_extraction_runs(tmp_path):
    video = ASSETS / "sample_road.mp4"
    if not video.exists():
        pytest.skip("sample_road.mp4 test asset not available")

    result = extract_keyframes(video, tmp_path, threshold=0.92, temporal_gap=4)
    assert result["frames_read"] == 120
    assert result["keyframes_saved"] >= 1
    assert 0 <= result["reduction_percent"] <= 100
    assert len(result["saved_frames"]) == result["keyframes_saved"]
    for frame in result["saved_frames"]:
        assert Path(frame["path"]).exists()


def test_detection_model_uses_trained_classes():
    if not settings.MODEL_WEIGHTS.exists():
        pytest.skip("trained weights not available")
    model = load_model(settings.MODEL_WEIGHTS)
    assert [model.names[i] for i in sorted(model.names)] == ["crack", "garbage", "pothole"]


def test_detection_output_schema(tmp_path):
    image = ASSETS / "sample_road.jpg"
    if not image.exists():
        pytest.skip("sample_road.jpg test asset not available")
    if not settings.MODEL_WEIGHTS.exists():
        pytest.skip("trained weights not available")

    import cv2

    frame = cv2.imread(str(image))
    cv2.imwrite(str(tmp_path / image.name), frame)

    results = analyze_images(tmp_path, mode="yolo", weights=settings.MODEL_WEIGHTS, conf=0.15)
    assert len(results) == 1
    record = results[0]
    assert set(record) >= {"image", "detections", "path"}
    for detection in record["detections"]:
        assert set(detection) == {"class_name", "confidence", "bbox", "source"}
        assert 0 <= detection["confidence"] <= 1
        assert len(detection["bbox"]) == 4
