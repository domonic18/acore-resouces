"""wago.tools API 数据模型。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class WagoBuildInfo(BaseModel):
    """wago.tools 返回的构建信息。"""

    product: str
    version: str
    created_at: str
    build_config: str | None = Field(default=None, alias="build_config")
    product_config: str | None = Field(default=None, alias="product_config")
    cdn_config: str | None = Field(default=None, alias="cdn_config")
    is_bgdl: bool | None = Field(default=None, alias="is_bgdl")


class WagoFileInfo(BaseModel):
    """wago.tools 搜索返回的文件信息。"""

    file_data_id: int
    path: str
