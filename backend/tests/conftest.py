"""Pytest fixtures: isolated SQLite database and authenticated API clients."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="urbanvision_test_"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["DEMO_PASSWORD"] = "Urban@123"
os.environ["DATA_DIR"] = str(_TMP / "data")
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["OUTPUT_DIR"] = str(_TMP / "outputs")
os.environ["REPORT_DIR"] = str(_TMP / "reports")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def _login(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": os.environ["DEMO_PASSWORD"]},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin_headers(client: TestClient) -> dict[str, str]:
    return _login(client, "admin@urbanvision.ai")


@pytest.fixture(scope="session")
def officer_headers(client: TestClient) -> dict[str, str]:
    return _login(client, "officer@urbanvision.ai")


@pytest.fixture(scope="session")
def inspector_headers(client: TestClient) -> dict[str, str]:
    return _login(client, "inspector@urbanvision.ai")
