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
    # 缺省沿用 MCC 批次通用模板值（官方 3.3.5 数据中的主流碰撞默认值）
    collision_width: float | None = Field(default=0.6111)
    collision_height: float | None = Field(default=2.031)
    mount_height: float | None = Field(default=0.0)


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
    size_class: int | None = Field(default=1)
    blood_id: int | None = Field(default=None)
    npc_sound_id: int | None = Field(default=47)
    particle_color_id: int | None = Field(default=None)
    creature_geoset_data: int | None = Field(default=None)
    object_effect_package_id: int | None = Field(default=None)


class Spell(DBCRecord):
    """Spell.dbc 记录对应的资源数据。"""

    # 注意：visual_id 沿用历史命名，实际存储坐骑召唤法术 EffectMiscValue_1
    # 的挂载生物 entry（恒等于 db.creature_template.entry，校验层强制一致），
    # 并非 Spell.dbc 的 SpellVisualID 字段。
    visual_id: int | None = Field(default=None)
    # 真正的 SpellVisualID_1 覆盖值；缺省时按 mount_type 取模板默认（陆地/水上 5160、飞行 7644）
    spell_visual_id: int | None = Field(default=None)
    icon_id: int | None = Field(default=None)
    name: str | None = Field(default=None)
    description: str | None = Field(default=None)
    # 速度百分比字段按光环类型定位效果槽位写入（EffectBasePoints_N = 值 - 1）：
    # speed → 光环 32（移动速度，陆地坐骑=骑乘速度、飞行坐骑=地面速度）
    # flight_speed → 光环 207（飞行速度，官方档位 280/310，缺省 280）
    # swim_speed → 光环 58（游泳速度，模板默认 60）
    speed: int | None = Field(default=None)
    flight_speed: int | None = Field(default=None)
    swim_speed: int | None = Field(default=None)


class Item(DBCRecord):
    """Item.dbc 记录对应的资源数据。"""

    class_: int | None = Field(default=None, alias="class")
    subclass: int | None = Field(default=None)
    material: int | None = Field(default=4)
    display_id: int | None = Field(default=None)
    inventory_type: int | None = Field(default=None)
    sheath: int | None = Field(default=None)


class ItemDisplayInfoEntry(BaseModel):
    """ItemDisplayInfo.dbc 源文件单条记录（仅读取选择器所需字段）。

    与上方资源 YAML 模型不同：该模型描述项目 DBC 源文件中的记录，
    icon_name 即 InventoryIcon（第 5 列），决定物品的游戏内图标。
    """

    id: int
    icon_name: str | None


class ItemDisplayInfoPage(BaseModel):
    """ItemDisplayInfo.dbc 分页搜索结果。"""

    items: list[ItemDisplayInfoEntry]
    total: int
