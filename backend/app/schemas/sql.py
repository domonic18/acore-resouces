"""坐骑补丁涉及的核心 SQL 表记录 Pydantic 模型。

这些模型表示资源 YAML 中存储的 SQL 数据（字段名为 snake_case），
用于替代 `dict[str, Any]`，在 schema 层提供字段类型保证。
服务层仍可通过 `model_dump()` 转回 dict 以保持兼容性。
"""

from __future__ import annotations

from typing import Any, get_type_hints

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _empty_to_none(value: Any) -> Any:
    """将空字符串或 0 归一化为 None，兼容旧 YAML/Excel 数据。"""
    return None if value == "" or value == 0 else value


class SQLRecord(BaseModel):
    """SQL 记录基类，忽略 YAML 中可能存在的未知字段。"""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def _normalize_unset_values(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        hints = get_type_hints(cls)
        # 字段默认值为空串的场景（如 subname/IconName），空串是合法值，
        # 不应被归一化为 None；其余字段保持原有 "" / 0 -> None 的兼容行为。
        empty_str_fields = {name for name, f in cls.model_fields.items() if f.default == ""}
        normalized: dict[str, Any] = {}
        for key, value in data.items():
            hint = hints.get(key)
            if key in empty_str_fields:
                normalized[key] = value
            elif value == "":
                normalized[key] = None
            elif hint == (str | None) and value == 0:
                normalized[key] = None
            else:
                normalized[key] = value
        return normalized


class CreatureModelInfo(SQLRecord):
    """creature_model_info 表记录。"""

    display_id: int | None = Field(default=None)
    bounding_radius: float | None = Field(default=None)
    combat_reach: float | None = Field(default=None)
    gender: int | None = Field(default=None)
    display_id_other_gender: int | None = Field(default=None)


class CreatureTemplate(SQLRecord):
    """creature_template 表记录。

    WotLK AzerothCore 当前 schema 已将 modelid1/bounding_radius/combat_reach/gender/
    display_id_other_gender 迁出至 creature_model_info 表，creature_template 仅保留
    坐骑 creature 自身属性。

    字段默认值与历史 batch1 SQL 保持一致，便于旧坐骑在不显式填写时仍能生成等价 SQL。
    """

    entry: int | None = Field(default=None)
    name: str | None = Field(default=None)
    # batch2 显式写空串；DB DEFAULT 为 NULL，需显式写出以保持一致
    subname: str | None = Field(default="")
    IconName: str | None = Field(default="")
    AIName: str | None = Field(default="")
    ScriptName: str | None = Field(default="")
    faction: int | None = Field(default=35)
    type: int | None = Field(default=1)
    unit_class: int | None = Field(default=1)
    unit_flags2: int | None = Field(default=2048)
    minlevel: int | None = Field(default=1)
    maxlevel: int | None = Field(default=2)
    speed_walk: float | None = Field(default=1.0)
    speed_run: float | None = Field(default=1.14286)
    speed_swim: float | None = Field(default=1.0)
    speed_flight: float | None = Field(default=1.0)
    detection_range: float | None = Field(default=1.0)
    HoverHeight: float | None = Field(default=1.0)
    DamageModifier: float | None = Field(default=1.0)
    HealthModifier: float | None = Field(default=1.0)
    ManaModifier: float | None = Field(default=1.0)
    ArmorModifier: float | None = Field(default=1.0)
    ExperienceModifier: float | None = Field(default=1.0)
    RegenHealth: int | None = Field(default=1)
    flags_extra: int | None = Field(default=2)
    # batch1 显式写 0，但 DB DEFAULT 为 1，需显式写出以保持一致
    BaseVariance: float | None = Field(default=0.0)
    RangeVariance: float | None = Field(default=0.0)
    VerifiedBuild: int | None = Field(default=0)


class ItemTemplate(SQLRecord):
    """item_template 表记录。

    spellid_1 / spelltrigger_2 / spellcategory_* 等坐骑机制字段使用 batch1 默认值
    （Riding Skill 55884 / On Learn 6 / Riding category 330 等），保存到 YAML
    便于使用者按需覆盖。
    """

    entry: int | None = Field(default=None)
    name: str | None = Field(default=None)
    class_: int | None = Field(default=15, alias="class")
    subclass: int | None = Field(default=5)
    displayid: int | None = Field(default=None)
    # 坐骑物品 slot 1：Riding Skill（55884）固定配置
    spellid_1: int | None = Field(default=55884)
    spelltrigger_1: int | None = Field(default=0)
    spellcharges_1: int | None = Field(default=-1)
    spellppmRate_1: int | None = Field(default=0)
    spellcooldown_1: int | None = Field(default=-1)
    spellcategory_1: int | None = Field(default=330)
    spellcategorycooldown_1: int | None = Field(default=3000)
    # 坐骑物品 slot 2：召唤法术（spellid_2 由资源 dbc.spell.id 提供）
    spellid_2: int | None = Field(default=None)
    spelltrigger_2: int | None = Field(default=6)
    spellcharges_2: int | None = Field(default=0)
    spellppmRate_2: int | None = Field(default=0)
    spellcooldown_2: int | None = Field(default=-1)
    spellcategory_2: int | None = Field(default=0)
    spellcategorycooldown_2: int | None = Field(default=-1)
    # 物品基础属性
    Quality: int | None = Field(default=4)
    AllowableClass: int | None = Field(default=-1)
    AllowableRace: int | None = Field(default=2047)
    BuyCount: int | None = Field(default=1)
    BuyPrice: int | None = Field(default=1000000)
    SellPrice: int | None = Field(default=250000)
    InventoryType: int | None = Field(default=0)
    ItemLevel: int | None = Field(default=40)
    RequiredLevel: int | None = Field(default=40)
    RequiredSkill: int | None = Field(default=762)
    RequiredSkillRank: int | None = Field(default=150)
    bonding: int | None = Field(default=1)
    Material: int | None = Field(default=4)
    sheath: int | None = Field(default=0)
    stackable: int | None = Field(default=1)
    description: str | None = Field(default=" 教你学会召唤这种坐骑。这是一种非常快速的坐骑。")
    # batch1 显式写 0，但 DB DEFAULT 为 NULL/1000，需显式写出以保持一致
    delay: int | None = Field(default=0)
    holy_res: int | None = Field(default=0)
    fire_res: int | None = Field(default=0)
    nature_res: int | None = Field(default=0)
    frost_res: int | None = Field(default=0)
    shadow_res: int | None = Field(default=0)
    arcane_res: int | None = Field(default=0)
    VerifiedBuild: int | None = Field(default=12340)
