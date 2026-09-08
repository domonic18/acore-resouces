"""ai_config_service 单元测试：加密存储、脱敏回显与连通性测试。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.schemas.ai_config import AiConfigUpdate
from app.services import ai_config_service
from app.services.ai_config_service import AiConfigError, EffectiveAiConfig


@pytest.fixture
def db(tmp_path: Path) -> Session:
    """独立临时 SQLite 会话（不触碰真实 workspace 库）。"""
    engine = create_engine(f"sqlite:///{tmp_path / 'ai_test.db'}")
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def key_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """加密密钥文件指向临时 workspace。"""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.setattr(settings, "workspace_dir", workspace)
    return workspace / "data" / "ai_secret.key"


def test_upsert_encrypts_and_roundtrip(db: Session, key_env: Path) -> None:
    """密钥 Fernet 加密落库，可解密还原。"""
    row = ai_config_service.upsert(
        db,
        AiConfigUpdate(
            base_url="https://open.bigmodel.cn/api/paas/v4/",
            model="glm-4.7",
            api_key="sk-test-1234567890abcdef",
            enabled=True,
        ),
    )

    assert row.api_key_encrypted is not None
    assert "sk-test-1234567890abcdef" not in row.api_key_encrypted
    assert ai_config_service.decrypt_key(row) == "sk-test-1234567890abcdef"
    # base_url 去尾部斜杠
    assert row.base_url == "https://open.bigmodel.cn/api/paas/v4"
    assert key_env.is_file()


def test_upsert_blank_key_keeps_and_clear_removes(db: Session, key_env: Path) -> None:
    """api_key 留空保持不变；clear_api_key 清除。"""
    ai_config_service.upsert(
        db, AiConfigUpdate(base_url="https://x", model="m", api_key="sk-keep-me-123", enabled=True)
    )
    row = ai_config_service.upsert(db, AiConfigUpdate(base_url="https://x", model="m", enabled=True))
    assert ai_config_service.decrypt_key(row) == "sk-keep-me-123"

    row = ai_config_service.upsert(
        db, AiConfigUpdate(base_url="https://x", model="m", clear_api_key=True)
    )
    assert ai_config_service.decrypt_key(row) is None


def test_load_effective_config_gates(
    db: Session, key_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """未启用或缺 base_url/model 时返回 None。"""
    ai_config_service.upsert(
        db,
        AiConfigUpdate(base_url="https://x", model="m", api_key="sk-k", enabled=False),
    )
    monkeypatch.setattr(ai_config_service, "SessionLocal", sessionmaker(
        bind=db.get_bind()
    ))
    assert ai_config_service.load_effective_config() is None

    ai_config_service.upsert(db, AiConfigUpdate(base_url="https://x", model="", enabled=True))
    assert ai_config_service.load_effective_config() is None

    ai_config_service.upsert(db, AiConfigUpdate(base_url="https://x", model="m", enabled=True))
    cfg = ai_config_service.load_effective_config()
    assert cfg is not None
    assert cfg.base_url == "https://x"
    assert cfg.api_key == "sk-k"
    assert cfg.timeout_seconds == 180
    assert cfg.max_tokens == 4000

    ai_config_service.upsert(
        db,
        AiConfigUpdate(base_url="https://x", model="m", timeout_seconds=300, max_tokens=8000, enabled=True),
    )
    cfg = ai_config_service.load_effective_config()
    assert cfg is not None
    assert cfg.timeout_seconds == 300
    assert cfg.max_tokens == 8000


def _fake_httpx_post(payload_code: int = 200, protocol: str = "openai") -> Any:
    calls: list[dict[str, Any]] = []

    def _post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append({"url": url, **kwargs})
        if payload_code != 200:
            body: dict[str, Any] = {"error": "bad key"}
        elif protocol == "anthropic":
            body = {"content": [{"type": "text", "text": "pong"}]}
        else:
            body = {"choices": [{"message": {"content": "pong"}}]}
        return httpx.Response(payload_code, json=body)

    _post.calls = calls  # type: ignore[attr-defined]
    return _post


def test_test_connection_ok_persists(
    db: Session, key_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai_config_service.httpx, "post", _fake_httpx_post(200))
    ai_config_service.upsert(
        db,
        AiConfigUpdate(base_url="https://api.test/v1", model="m", api_key="sk-abcdef123456", enabled=True),
    )

    ok, err = ai_config_service.test_connection(db)

    assert ok and err is None
    row = ai_config_service.get_row(db)
    assert row is not None
    assert row.last_test_status == "ok"
    assert row.last_tested_at is not None
    # 请求打到 {base_url}/chat/completions 且带鉴权头
    fake = ai_config_service.httpx.post
    call = fake.calls[0]  # type: ignore[attr-defined]
    assert call["url"] == "https://api.test/v1/chat/completions"
    assert call["headers"]["Authorization"] == "Bearer sk-abcdef123456"


def test_test_connection_http_error_and_timeout(
    db: Session, key_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai_config_service.httpx, "post", _fake_httpx_post(401))
    ai_config_service.upsert(
        db, AiConfigUpdate(base_url="https://api.test/v1", model="m", api_key="sk-bad", enabled=True)
    )
    ok, err = ai_config_service.test_connection(db)
    assert not ok and err is not None and "401" in err

    def _timeout(url: str, **kwargs: Any) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out")

    monkeypatch.setattr(ai_config_service.httpx, "post", _timeout)
    ok, err = ai_config_service.test_connection(db)
    assert not ok and err is not None and "连接失败" in err


def test_test_connection_without_saved_config(db: Session, key_env: Path) -> None:
    ok, err = ai_config_service.test_connection(db)
    assert not ok and err is not None and "尚未保存" in err


def test_test_connection_anthropic_ok(
    db: Session, key_env: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """anthropic 协议：请求 /v1/messages，双认证头，解析 content 块。"""
    monkeypatch.setattr(ai_config_service.httpx, "post", _fake_httpx_post(200, protocol="anthropic"))
    ai_config_service.upsert(
        db,
        AiConfigUpdate(
            base_url="https://api.moonshot.cn/anthropic",
            model="kimi-k2.5",
            protocol="anthropic",
            api_key="sk-anthropic-key-123456",
            enabled=True,
        ),
    )

    ok, err = ai_config_service.test_connection(db)

    assert ok and err is None
    fake = ai_config_service.httpx.post
    call = fake.calls[0]  # type: ignore[attr-defined]
    assert call["url"] == "https://api.moonshot.cn/anthropic/v1/messages"
    assert call["headers"]["x-api-key"] == "sk-anthropic-key-123456"
    assert call["headers"]["Authorization"] == "Bearer sk-anthropic-key-123456"
    assert call["headers"]["anthropic-version"] == "2023-06-01"
    assert call["json"]["max_tokens"] == 1
    assert call["json"]["messages"] == [{"role": "user", "content": "ping"}]
    row = ai_config_service.get_row(db)
    assert row is not None and row.last_test_status == "ok"


def test_chat_anthropic_lifts_system_message(key_env: Path) -> None:
    """system 角色消息提升为顶层 system 参数，messages 只剩 user/assistant。"""
    cfg = EffectiveAiConfig(
        base_url="https://api.moonshot.cn/anthropic",
        api_key=None,
        model="kimi-k2.5",
        protocol="anthropic",
        enabled=True,
    )
    monkeypost = _fake_httpx_post(200, protocol="anthropic")

    orig = ai_config_service.httpx.post
    ai_config_service.httpx.post = monkeypost  # type: ignore[assignment]
    try:
        text = ai_config_service.chat_completions(
            cfg,
            [
                {"role": "system", "content": "你是公告撰写助手"},
                {"role": "user", "content": "写补丁日志"},
            ],
            timeout=5,
            max_tokens=100,
        )
    finally:
        ai_config_service.httpx.post = orig  # type: ignore[assignment]

    assert text == "pong"
    payload = monkeypost.calls[0]["json"]
    assert payload["system"] == "你是公告撰写助手"
    assert payload["messages"] == [{"role": "user", "content": "写补丁日志"}]
    assert "system" not in [m["role"] for m in payload["messages"]]


def test_chat_anthropic_bad_structure_raises(key_env: Path) -> None:
    cfg = EffectiveAiConfig(
        base_url="https://x", api_key=None, model="m", protocol="anthropic", enabled=True
    )

    def _post(url: str, **kwargs: Any) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": True})

    orig = ai_config_service.httpx.post
    ai_config_service.httpx.post = _post  # type: ignore[assignment]
    try:
        with pytest.raises(AiConfigError, match="响应结构异常"):
            ai_config_service.chat_completions(
                cfg, [{"role": "user", "content": "hi"}], timeout=5, max_tokens=1
            )
    finally:
        ai_config_service.httpx.post = orig  # type: ignore[assignment]


def test_ensure_table_migrates_legacy_protocol_column(
    db: Session, key_env: Path
) -> None:
    """存量库（无 protocol/timeout_seconds/max_tokens 列）自动补列并回填默认值。"""
    engine = db.get_bind()
    from sqlalchemy import text as sa_text

    with engine.begin() as conn:
        conn.execute(
            sa_text(
                "CREATE TABLE ai_config (id INTEGER PRIMARY KEY, base_url VARCHAR, "
                "api_key_encrypted TEXT, model VARCHAR, enabled BOOLEAN, "
                "last_tested_at DATETIME, last_test_status VARCHAR, last_test_error TEXT)"
            )
        )
        conn.execute(sa_text("INSERT INTO ai_config (id, base_url, model) VALUES (1, 'https://x', 'm')"))

    row = ai_config_service.get_row(db)
    assert row is not None
    assert row.protocol == "openai"
    assert row.timeout_seconds == 180
    assert row.max_tokens == 4000
    resp = ai_config_service.to_response(row)
    assert resp.protocol == "openai"
    assert resp.timeout_seconds == 180
    assert resp.max_tokens == 4000


def test_chat_completions_bad_structure_raises(key_env: Path) -> None:
    cfg = EffectiveAiConfig(base_url="https://x", api_key=None, model="m", enabled=True)

    def _post(url: str, **kwargs: Any) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": True})

    orig = ai_config_service.httpx.post
    ai_config_service.httpx.post = _post  # type: ignore[assignment]
    try:
        with pytest.raises(AiConfigError, match="响应结构异常"):
            ai_config_service.chat_completions(
                cfg, [{"role": "user", "content": "hi"}], timeout=5, max_tokens=1
            )
    finally:
        ai_config_service.httpx.post = orig  # type: ignore[assignment]


def test_mask_key() -> None:
    assert ai_config_service.mask_key("short") == "****"
    assert ai_config_service.mask_key("sk-1234567890abcdef") == "sk-1...cdef"


def test_to_response_masks(db: Session, key_env: Path) -> None:
    row = ai_config_service.upsert(
        db,
        AiConfigUpdate(base_url="https://x", model="m", api_key="sk-abcdefgh1234", enabled=True),
    )
    resp = ai_config_service.to_response(row)
    assert resp.configured and resp.enabled
    assert resp.api_key_masked == "sk-a...1234"
    assert "api_key" not in resp.model_fields or not hasattr(resp, "api_key")

    empty = ai_config_service.to_response(None)
    assert not empty.configured and empty.api_key_masked is None
