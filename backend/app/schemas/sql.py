"""坐骑补丁涉及的核心 SQL 表记录 Pydantic 模型。

这些模型表示资源 YAML 中存储的 SQL 数据（字段名为 snake_case），
用于替代 `dict[str, Any]`，在 schema 层提供字段类型保证。
服务层仍可通过 `model_dump()` 转回 dict 以保持兼容性。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _empty_to_none(value: Any) -> Any:
    """将空字符串归一化为 None，兼容旧 YAML/Excel 数据。"""
    return None if value == "" else value


class SQLRecord(BaseModel):
    """SQL 记录基类，忽略 YAML 中可能存在的未知字段。"""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def _normalize_empty_strings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: _empty_to_none(v) for k, v in data.items()}
        return data


class CreatureModelInfo(SQLRecord):
    """creature_model_info 表记录。"""

    display_id: int | None = Field(default=None)
    bounding_radius: float | None = Field(default=None)
    combat_reach: float | None = Field(default=None)
    gender: int | None = Field(default=None)
    display_id_other_gender: int | None = Field(default=None)


class CreatureTemplate(SQLRecord):
    """creature_template 表记录。"""

    entry: int | None = Field(default=None)
    name: str | None = Field(default=None)
    modelid1: int | None = Field(default=None)
    faction: int | None = Field(default=None)
    type: int | None = Field(default=None)
    unit_class: int | None = Field(default=None)
    unit_flag2: int | None = Field(default=None)
    bounding_radius: float | None = Field(default=None)
    combat_reach: float | None = Field(default=None)
    gender: int | None = Field(default=None)
    display_id_other_gender: int | None = Field(default=None)


class ItemTemplate(SQLRecord):
    """item_template 表记录。"""

    entry: int | None = Field(default=None)
    name: str | None = Field(default=None)
    class_: int | None = Field(default=None, alias="class")
    subclass: int | None = Field(default=None)
    displayid: int | None = Field(default=None)
    spellid_1: int | None = Field(default=None)
    spelltrigger_1: int | None = Field(default=None)
    spellcharges_1: int | None = Field(default=None)
    spellid_2: int | None = Field(default=None)
    spelltrigger_2: int | None = Field(default=None)
    spellcharges_2: int | None = Field(default=None)
    Quality: int | None = Field(default=None)
    AllowableClass: int | None = Field(default=None)
    AllowableRace: int | None = Field(default=None)
