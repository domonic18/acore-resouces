"""AI 服务配置模型（单行，运行时可写）。"""

from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.db.session import Base


class AiConfig(Base):
    """AI 端点配置（OpenAI 兼容或 Anthropic 协议），service 层保证仅存在 id=1 一行。"""

    __tablename__ = "ai_config"

    id = Column(Integer, primary_key=True)
    base_url = Column(String, nullable=True)
    api_key_encrypted = Column(Text, nullable=True)
    model = Column(String, nullable=True)
    protocol = Column(String, nullable=False, default="openai", server_default="openai")
    timeout_seconds = Column(Integer, nullable=False, default=180, server_default="180")
    max_tokens = Column(Integer, nullable=False, default=4000, server_default="4000")
    enabled = Column(Boolean, default=False)
    last_tested_at = Column(DateTime, nullable=True)
    last_test_status = Column(String, nullable=True)
    last_test_error = Column(Text, nullable=True)
