"""AI 服务配置的请求/响应模型。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

AiProtocol = Literal["openai", "anthropic"]


class AiConfigUpdate(BaseModel):
    """更新 AI 配置；api_key 留空表示不修改，clear_api_key 用于清除。"""

    base_url: str = Field(
        default="",
        description="端点根地址：OpenAI 兼容如 https://open.bigmodel.cn/api/paas/v4；Anthropic 如 https://api.moonshot.cn/anthropic",
    )
    model: str = Field(default="", description="模型名，如 glm-5.3 / kimi-k3 / deepseek-chat / MiniMax-M3")
    protocol: AiProtocol = Field(default="openai", description="请求协议：openai 或 anthropic")
    api_key: str | None = Field(default=None, description="留空/省略表示保持不变")
    clear_api_key: bool = Field(default=False, description="清除已保存的密钥")
    timeout_seconds: int = Field(
        default=180, ge=10, le=600, description="LLM 请求超时（秒）"
    )
    max_tokens: int = Field(
        default=4000, ge=256, le=32000, description="LLM 单次回复最大 tokens"
    )
    enabled: bool = Field(default=False, description="是否在构建时启用 AI 生成 changelog")


class AiConfigResponse(BaseModel):
    configured: bool = Field(description="base_url 与 model 是否均已填写")
    base_url: str
    model: str
    protocol: AiProtocol = "openai"
    api_key_masked: str | None = None
    timeout_seconds: int = 180
    max_tokens: int = 4000
    enabled: bool
    last_tested_at: datetime | None = None
    last_test_status: str | None = None
    last_test_error: str | None = None


class AiConfigTestResponse(BaseModel):
    ok: bool
    error: str | None = None
    tested_at: datetime
