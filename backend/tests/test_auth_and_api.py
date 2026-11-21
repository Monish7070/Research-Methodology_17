"""API tests for authentication, authorisation and dashboard endpoints."""

from __future__ import annotations


def test_health_is_public(client):
    response = client.get("/api/system/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_login_success_and_me(client, admin_headers):
    response = client.get("/api/auth/me", headers=admin_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "admin"
    assert "user:manage" in payload["permissions"]


def test_login_rejects_bad_password(client):
    response = client.post(
        "/api/auth/login", json={"email": "admin@urbanvision.ai", "password": "wrong-password"}
    )
    assert response.status_code == 401


def test_protected_endpoint_requires_token(client):
    for path in ("/api/dashboard/summary", "/api/detections", "/api/videos", "/api/system/status"):
        assert client.get(path).status_code == 401


def test_registration_cannot_create_admin(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Escalation Attempt", "email": "escalate@example.com", "password": "Passw0rd!", "role": "admin"},
    )
    assert response.status_code == 403


def test_inspector_cannot_manage_users(client, inspector_headers):
    assert client.get("/api/users", headers=inspector_headers).status_code == 403
    assert client.get("/api/settings", headers=inspector_headers).status_code == 403


def test_admin_can_list_users(client, admin_headers):
    response = client.get("/api/users", headers=admin_headers)
    assert response.status_code == 200
    assert len(response.json()["items"]) >= 3


def test_dashboard_summary_shape(client, admin_headers):
    response = client.get("/api/dashboard/summary", headers=admin_headers)
    assert response.status_code == 200
    cards = response.json()["cards"]
    for key in ("total_videos", "total_keyframes", "total_defects", "high_priority", "pending_maintenance"):
        assert key in cards


def test_priority_settings_validation(client, admin_headers):
    bad = {
        "weights": {"severity": 0.9, "confidence": 0.9, "risk": 0.9, "location": 0.9},
        "class_severity": {},
        "class_risk": {},
        "location": {},
        "categories": {"low_max": 39, "medium_max": 69},
    }
    response = client.put("/api/priority/settings", json=bad, headers=admin_headers)
    assert response.status_code == 422
    assert "sum to 1" in response.json()["detail"]


def test_inspector_cannot_change_priority_settings(client, inspector_headers):
    response = client.put(
        "/api/priority/settings",
        json={"weights": {"severity": 0.4, "confidence": 0.2, "risk": 0.25, "location": 0.15}},
        headers=inspector_headers,
    )
    assert response.status_code == 403


def test_upload_rejects_unsupported_extension(client, admin_headers):
    response = client.post(
        "/api/videos/upload",
        files={"file": ("notes.txt", b"not a video", "text/plain")},
        headers=admin_headers,
    )
    assert response.status_code == 400


def test_processing_requires_existing_video(client, admin_headers):
    response = client.post("/api/processing/start/9999", headers=admin_headers)
    assert response.status_code == 404


def test_model_weights_present(client, admin_headers):
    response = client.get("/api/system/status", headers=admin_headers)
    assert response.status_code == 200
    model = response.json()["model"]
    assert model["exists"] is True
    assert model["classes"] == ["crack", "garbage", "pothole"]
