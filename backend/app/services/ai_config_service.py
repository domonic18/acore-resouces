"""AI 服务配置服务：Fernet 加密存储、连通性测试与双协议 LLM 调用。

支持 OpenAI 兼容（POST {base_url}/chat/completions）与 Anthropic 协议
（POST {base_url}/v1/messages，适配 Kimi/Moonshot 的 Anthropic 兼容端点）。
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, cast

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import Base, SessionLocal
from app.models.ai_config import AiConfig
from app.schemas.ai_config import AiConfigResponse, AiConfigUpdate

_lock = threading.Lock()

ANTHROPIC_VERSION = "2023-06-01"

DEFAULT_TIMEOUT_SECONDS = 180
DEFAULT_MAX_TOKENS = 4000


class AiConfigError(Exception):
    """AI 端点调用失败（HTTP 非 200 或响应结构异常）。"""


@dataclass
class EffectiveAiConfig:
    """构建链路直接取用的解密后配置。"""

    base_url: str
    api_key: str | None
    model: str
    protocol: str = "openai"
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS
    max_tokens: int = DEFAULT_MAX_TOKENS
    enabled: bool = True


def _fernet() -> Fernet:
    """读取或生成本地加密密钥文件（workspace/data/ai_secret.key，不入 Git）。"""
    key_file = settings.workspace_dir / "data" / "ai_secret.key"
    with _lock:
        if not key_file.exists():
            key_file.parent.mkdir(parents=True, exist_ok=True)
            key_file.write_bytes(Fernet.generate_key())
            key_file.chmod(0o600)
        return Fernet(key_file.read_bytes())


def _ensure_table(db: Session) -> None:
    """确保 ai_config 表存在且包含全部列（存量库补列迁移，测试注入临时库）。"""
    engine = cast("Engine", db.get_bind())
    Base.metadata.create_all(bind=engine, tables=[AiConfig.__table__])
    inspector = inspect(engine)
    if "ai_config" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("ai_config")}
    migrations = {
        "protocol": "ALTER TABLE ai_config ADD COLUMN protocol "
        "VARCHAR NOT NULL DEFAULT 'openai'",
        "timeout_seconds": "ALTER TABLE ai_config ADD COLUMN timeout_seconds "
        "INTEGER NOT NULL DEFAULT 180",
        "max_tokens": "ALTER TABLE ai_config ADD COLUMN max_tokens "
        "INTEGER NOT NULL DEFAULT 4000",
    }
    for column, ddl in migrations.items():
        if column not in columns:
            with engine.begin() as conn:
                conn.execute(text(ddl))


def mask_key(key: str) -> str:
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}...{key[-4:]}"


def decrypt_key(row: AiConfig) -> str | None:
    if not row.api_key_encrypted:
        return None
    try:
        return _fernet().decrypt(row.api_key_encrypted.encode()).decode()
    except InvalidToken:
        return None


def get_row(db: Session) -> AiConfig | None:
    _ensure_table(db)
    return db.get(AiConfig, 1)


def upsert(db: Session, payload: AiConfigUpdate) -> AiConfig:
    """保存配置；api_key 留空保持不变，clear_api_key 清除。"""
    _ensure_table(db)
    row = db.get(AiConfig, 1)
    if row is None:
        row = AiConfig(id=1)
        db.add(row)
    row.base_url = payload.base_url.strip().rstrip("/")  # type: ignore[assignment]
    row.model = payload.model.strip()  # type: ignore[assignment]
    row.protocol = payload.protocol  # type: ignore[assignment]
    row.timeout_seconds = payload.timeout_seconds  # type: ignore[assignment]
    row.max_tokens = payload.max_tokens  # type: ignore[assignment]
    if payload.clear_api_key:
        row.api_key_encrypted = None  # type: ignore[assignment]
    elif payload.api_key and payload.api_key.strip():
        row.api_key_encrypted = _fernet().encrypt(payload.api_key.strip().encode()).decode()  # type: ignore[assignment]
    row.enabled = payload.enabled  # type: ignore[assignment]
    db.commit()
    db.refresh(row)
    return row


def load_effective_config() -> EffectiveAiConfig | None:
    """构建链路取用；未启用或未配置 base_url/model 时返回 None。"""
    db = SessionLocal()
    try:
        row = get_row(db)
        if row is None or not row.enabled or not row.base_url or not row.model:
            return None
        return EffectiveAiConfig(
            base_url=str(row.base_url),
            api_key=decrypt_key(row),
            model=str(row.model),
            protocol=str(row.protocol or "openai"),
            timeout_seconds=int(row.timeout_seconds or DEFAULT_TIMEOUT_SECONDS),
            max_tokens=int(row.max_tokens or DEFAULT_MAX_TOKENS),
            enabled=True,
        )
    finally:
        db.close()


def chat_completions(
    cfg: EffectiveAiConfig,
    messages: list[dict[str, str]],
    *,
    timeout: float,
    max_tokens: int,
    temperature: float = 0.3,
) -> str:
    """按配置协议调用 LLM，返回首个回复文本。

    openai → POST {base_url}/chat/completions；
    anthropic → POST {base_url}/v1/messages（system 消息提升为顶层参数）。

    Raises:
        AiConfigError: HTTP 非 200 或响应结构异常。
        httpx.HTTPError: 网络层失败（超时/连接错误）。
    """
    if cfg.protocol == "anthropic":
        return _chat_anthropic(cfg, messages, timeout=timeout, max_tokens=max_tokens, temperature=temperature)
    return _chat_openai(cfg, messages, timeout=timeout, max_tokens=max_tokens, temperature=temperature)


def _chat_openai(
    cfg: EffectiveAiConfig,
    messages: list[dict[str, str]],
    *,
    timeout: float,
    max_tokens: int,
    temperature: float,
) -> str:
    headers = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
    payload: dict[str, Any] = {
        "model": cfg.model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    resp = httpx.post(
        f"{cfg.base_url}/chat/completions", json=payload, headers=headers, timeout=timeout
    )
    if resp.status_code != 200:
        raise AiConfigError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as e:
        raise AiConfigError(f"响应结构异常: {str(data)[:200]}") from e


def _chat_anthropic(
    cfg: EffectiveAiConfig,
    messages: list[dict[str, str]],
    *,
    timeout: float,
    max_tokens: int,
    temperature: float,
) -> str:
    system_parts = [m["content"] for m in messages if m.get("role") == "system"]
    chat_messages = [m for m in messages if m.get("role") != "system"]
    payload: dict[str, Any] = {
        "model": cfg.model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": chat_messages,
        "stream": False,
    }
    if system_parts:
        payload["system"] = "\n\n".join(system_parts)
    # 同时携带两种认证头：官方 Anthropic 用 x-api-key，Kimi/Moonshot 网关按 Bearer 接收
    headers: dict[str, str] = {"anthropic-version": ANTHROPIC_VERSION}
    if cfg.api_key:
        headers["x-api-key"] = cfg.api_key
        headers["Authorization"] = f"Bearer {cfg.api_key}"
    resp = httpx.post(
        f"{cfg.base_url}/v1/messages", json=payload, headers=headers, timeout=timeout
    )
    if resp.status_code != 200:
        raise AiConfigError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    try:
        blocks = data["content"]
        return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
    except (KeyError, TypeError) as e:
        raise AiConfigError(f"响应结构异常: {str(data)[:200]}") from e


def test_connection(db: Session) -> tuple[bool, str | None]:
    """用已保存配置做 max_tokens=1 的 ping，并把结果持久化。"""
    row = get_row(db)
    if row is None or not row.base_url or not row.model:
        return False, "尚未保存 base_url 与 model，请先保存"
    cfg = EffectiveAiConfig(
        base_url=str(row.base_url),
        api_key=decrypt_key(row),
        model=str(row.model),
        protocol=str(row.protocol or "openai"),
        timeout_seconds=int(row.timeout_seconds or DEFAULT_TIMEOUT_SECONDS),
        max_tokens=int(row.max_tokens or DEFAULT_MAX_TOKENS),
        enabled=True,
    )
    ok, err = False, None
    try:
        chat_completions(cfg, [{"role": "user", "content": "ping"}], timeout=15, max_tokens=1)
        ok = True
    except AiConfigError as e:
        err = str(e)
    except httpx.HTTPError as e:
        err = f"连接失败: {e}"
    row.last_tested_at = datetime.now(UTC)  # type: ignore[assignment]
    row.last_test_status = "ok" if ok else "error"  # type: ignore[assignment]
    row.last_test_error = err  # type: ignore[assignment]
    db.commit()
    return ok, err


def to_response(row: AiConfig | None) -> AiConfigResponse:
    if row is None:
        return AiConfigResponse(configured=False, base_url="", model="", enabled=False)
    key = decrypt_key(row)
    return AiConfigResponse(
        configured=bool(row.base_url and row.model),
        base_url=str(row.base_url or ""),
        model=str(row.model or ""),
        protocol=cast('Literal["openai", "anthropic"]', row.protocol or "openai"),
        api_key_masked=mask_key(key) if key else None,
        timeout_seconds=int(row.timeout_seconds or DEFAULT_TIMEOUT_SECONDS),
        max_tokens=int(row.max_tokens or DEFAULT_MAX_TOKENS),
        enabled=bool(row.enabled),
        last_tested_at=cast("datetime | None", row.last_tested_at),
        last_test_status=cast("str | None", row.last_test_status),
        last_test_error=cast("str | None", row.last_test_error),
    )
