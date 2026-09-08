"""设置 API 集成测试：AI 服务配置的读写与连通性测试端点。"""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.services import ai_config_service


@pytest.fixture
def db_session(tmp_path: Path) -> Generator[Session, None, None]:
    """独立临时库会话，并覆盖 get_db 依赖。"""
    engine = create_engine(f"sqlite:///{tmp_path / 'settings_test.db'}")
    session = sessionmaker(bind=engine)()

    def _override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_db] = _override
    yield session
    app.dependency_overrides.pop(get_db, None)
    session.close()


@pytest.fixture
def key_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.setattr(settings, "workspace_dir", workspace)
    return workspace


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_get_ai_config_initial_empty(client: TestClient, db_session: Session, key_env: Path) -> None:
    resp = client.get("/api/settings/ai-config")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is False
    assert data["base_url"] == ""
    assert data["protocol"] == "openai"
    assert data["api_key_masked"] is None


def test_put_then_get_masks_key(client: TestClient, db_session: Session, key_env: Path) -> None:
    resp = client.put(
        "/api/settings/ai-config",
        json={"base_url": "https://api.moonshot.cn/anthropic", "model": "kimi-k2.5",
              "protocol": "anthropic", "api_key": "sk-testkey12345678", "enabled": True},
    )
    assert resp.status_code == 200

    data = client.get("/api/settings/ai-config").json()
    assert data["configured"] is True
    assert data["enabled"] is True
    assert data["protocol"] == "anthropic"
    assert data["api_key_masked"] == "sk-t...5678"
    assert data["timeout_seconds"] == 180
    assert data["max_tokens"] == 4000
    assert "api_key" not in data or not data.get("api_key")


def test_put_timeout_and_max_tokens_round_trip(
    client: TestClient, db_session: Session, key_env: Path
) -> None:
    resp = client.put(
        "/api/settings/ai-config",
        json={"base_url": "https://api.kimi.com/coding", "model": "kimi-k3",
              "protocol": "anthropic", "timeout_seconds": 300, "max_tokens": 8000,
              "enabled": True},
    )
    assert resp.status_code == 200
    data = client.get("/api/settings/ai-config").json()
    assert data["timeout_seconds"] == 300
    assert data["max_tokens"] == 8000


def test_put_rejects_out_of_range_params(
    client: TestClient, db_session: Session, key_env: Path
) -> None:
    resp = client.put(
        "/api/settings/ai-config",
        json={"base_url": "https://x", "model": "m", "timeout_seconds": 5},
    )
    assert resp.status_code == 422
    resp = client.put(
        "/api/settings/ai-config",
        json={"base_url": "https://x", "model": "m", "max_tokens": 99999},
    )
    assert resp.status_code == 422


def test_put_blank_api_key_keeps_secret(
    client: TestClient, db_session: Session, key_env: Path
) -> None:
    client.put(
        "/api/settings/ai-config",
        json={"base_url": "https://x", "model": "m", "api_key": "sk-abcdefgh1234", "enabled": True},
    )
    resp = client.put("/api/settings/ai-config", json={"base_url": "https://y", "model": "m2"})
    assert resp.status_code == 200

    data = client.get("/api/settings/ai-config").json()
    assert data["base_url"] == "https://y"
    assert data["model"] == "m2"
    assert data["api_key_masked"] == "sk-a...1234"


def test_test_endpoint_invokes_llm(
    client: TestClient, db_session: Session, key_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.put(
        "/api/settings/ai-config",
        json={"base_url": "https://api.test/v1", "model": "m", "api_key": "sk-abcdef123456"},
    )

    def _post(url: str, **kwargs: Any) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "pong"}}]})

    monkeypatch.setattr(ai_config_service.httpx, "post", _post)
    resp = client.post("/api/settings/ai-config/test")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    # 测试结果持久化
    data = client.get("/api/settings/ai-config").json()
    assert data["last_test_status"] == "ok"


def test_test_endpoint_without_saved_config_400(
    client: TestClient, db_session: Session, key_env: Path
) -> None:
    resp = client.post("/api/settings/ai-config/test")
    assert resp.status_code == 400
    assert "尚未保存" in resp.json()["detail"]
