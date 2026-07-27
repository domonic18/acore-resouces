"""坐骑补丁涉及的核心 DBC 记录 Pydantic 模型。

这些模型表示资源 YAML 中存储的 DBC 数据（字段名为 snake_case），
用于替代 `dict[str, Any]`，在 schema 层提供字段类型保证。
服务层仍可通过 `model_dump()` 转回 dict 以保持兼容性。
"""

from __future__ import annotations

from typing import Any, get_type_hints

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _empty_to_none(value: Any) -> Any:
    """将空字符串或 0 归一化为 None，兼容旧 YAML/Excel 数据。"""
    return None if value == "" or value == 0 else value


class DBCRecord(BaseModel):
    """DBC 记录基类，忽略 YAML 中可能存在的未知字段。"""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: int | None = Field(default=None)

    @model_validator(mode="before")
    @classmethod
    def _normalize_unset_values(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        hints = get_type_hints(cls)
        normalized: dict[str, Any] = {}
        for key, value in data.items():
            hint = hints.get(key)
            if value == "":
                normalized[key] = None
            elif hint == (str | None) and value == 0:
                normalized[key] = None
            else:
                normalized[key] = value
        return normalized


class CreatureModelData(DBCRecord):
    """CreatureModelData.dbc 记录对应的资源数据。"""

    flags: int | None = Field(default=None)
    model_name: str | None = Field(default=None)
    model_scale: float | None = Field(default=None)
    collision_width: float | None = Field(default=None)
    collision_height: float | None = Field(default=None)
    mount_height: float | None = Field(default=None)


class CreatureDisplayInfo(DBCRecord):
    """CreatureDisplayInfo.dbc 记录对应的资源数据。"""

    model_id: int | None = Field(default=None)
    sound_id: int | None = Field(default=None)
    extra_display_information_id: int | None = Field(default=None)
    scale: float | None = Field(default=None)
    opacity: int | None = Field(default=None)
    texture_variation_1: str | None = Field(default=None)
    texture_variation_2: str | None = Field(default=None)
    texture_variation_3: str | None = Field(default=None)
    portrait_texture_name: str | None = Field(default=None)
    size_class: int | None = Field(default=None)
    blood_id: int | None = Field(default=None)
    npc_sound_id: int | None = Field(default=None)
    particle_color_id: int | None = Field(default=None)
    creature_geoset_data: int | None = Field(default=None)
    object_effect_package_id: int | None = Field(default=None)


class Spell(DBCRecord):
    """Spell.dbc 记录对应的资源数据。"""

    visual_id: int | None = Field(default=None)
    icon_id: int | None = Field(default=None)
    name: str | None = Field(default=None)
    description: str | None = Field(default=None)


class Item(DBCRecord):
    """Item.dbc 记录对应的资源数据。"""

    class_: int | None = Field(default=None, alias="class")
    subclass: int | None = Field(default=None)
    material: int | None = Field(default=None)
    display_id: int | None = Field(default=None)
    inventory_type: int | None = Field(default=None)
    sheath: int | None = Field(default=None)
