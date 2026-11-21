"""Unit tests for the weighted priority scoring model."""

from __future__ import annotations

import pytest

from src.priority_scoring import DEFAULT_CONFIG, calculate_priority, get_priority_category


def test_weights_sum_to_one():
    assert pytest.approx(sum(DEFAULT_CONFIG["weights"].values()), abs=1e-9) == 1.0


def test_pothole_scores_above_garbage():
    pothole = calculate_priority({"class_name": "pothole", "confidence": 0.9})
    garbage = calculate_priority({"class_name": "garbage", "confidence": 0.9})
    assert pothole["priority_score"] > garbage["priority_score"]


def test_contributions_sum_to_total():
    result = calculate_priority(
        {"class_name": "crack", "confidence": 0.8},
        location_verified=True,
        has_location=True,
    )
    contributions = (
        result["severity_contribution"]
        + result["confidence_contribution"]
        + result["risk_contribution"]
        + result["location_contribution"]
    )
    assert pytest.approx(contributions, abs=0.05) == result["priority_score"]


def test_score_is_bounded_and_components_normalized():
    result = calculate_priority({"class_name": "pothole", "confidence": 1.0}, location_verified=True, has_location=True)
    assert 0 <= result["priority_score"] <= 100
    for key in ("severity", "confidence", "risk", "location_component"):
        assert 0 <= result[key] <= 1


def test_missing_location_lowers_score():
    verified = calculate_priority(
        {"class_name": "pothole", "confidence": 0.9}, location_verified=True, has_location=True
    )
    missing = calculate_priority({"class_name": "pothole", "confidence": 0.9}, has_location=False)
    assert verified["priority_score"] > missing["priority_score"]
    assert missing["location_component"] == pytest.approx(DEFAULT_CONFIG["location"]["no_location"])


def test_category_thresholds():
    assert get_priority_category(0) == "low"
    assert get_priority_category(39) == "low"
    assert get_priority_category(40) == "medium"
    assert get_priority_category(69) == "medium"
    assert get_priority_category(70) == "high"
    assert get_priority_category(100) == "high"


def test_non_road_class_is_ignored():
    assert calculate_priority({"class_name": "person", "confidence": 0.99}) is None


def test_configurable_weights_change_score():
    custom = {
        **DEFAULT_CONFIG,
        "weights": {"severity": 0.10, "confidence": 0.70, "risk": 0.10, "location": 0.10},
        "class_severity": {"pothole": 0.2},
        "class_risk": {"pothole": 0.2},
    }
    result = calculate_priority(
        {"class_name": "pothole", "confidence": 1.0}, config=custom, location_verified=True, has_location=True
    )
    # 100 * (0.1*0.2 + 0.7*1.0 + 0.1*0.2 + 0.1*1.0) = 84
    assert result["priority_score"] == pytest.approx(84.0, abs=0.01)
