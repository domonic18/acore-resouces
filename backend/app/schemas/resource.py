from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, get_type_hints

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dbc import CreatureDisplayInfo, CreatureModelData, Item, Spell
from app.schemas.sql import CreatureModelInfo, CreatureTemplate, ItemTemplate


def _normalize_optional_field(value: Any, hint: Any | None) -> Any:
    """归一化可选字段的空值：空字符串或字符串字段的 0 转为 None。"""
    if value == "":
        return None
    if hint == (str | None) and value == 0:
        return None
    return value


def _normalize_dict_values(data: dict[str, Any], cls: type[BaseModel]) -> dict[str, Any]:
    """根据模型字段类型归一化字典中的未设置值。"""
    hints = get_type_hints(cls)
    return {k: _normalize_optional_field(v, hints.get(k)) for k, v in data.items()}


class DropInfo(BaseModel):
    entry: int | None = None
    instance: str | None = None
    boss: str | None = None
    rate: float | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_unset_values(cls, data: Any) -> Any:
        return _normalize_dict_values(data, cls) if isinstance(data, dict) else data


class OfficialDbInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    spell_icon_name: str | None = None
    icon_name: str | None = None
    spell_wowhead_url: str | None = None
    item_wowhead_url: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_unset_values(cls, data: Any) -> Any:
        return _normalize_dict_values(data, cls) if isinstance(data, dict) else data


class DbcInfo(BaseModel):
    creature_model_data: CreatureModelData = Field(
        default_factory=CreatureModelData,
    )
    creature_display_info: CreatureDisplayInfo = Field(
        default_factory=CreatureDisplayInfo,
    )
    spell: Spell = Field(default_factory=Spell)
    item: Item = Field(default_factory=Item)


class DbInfo(BaseModel):
    creature_template: CreatureTemplate = Field(default_factory=CreatureTemplate)
    creature_model_info: CreatureModelInfo = Field(
        default_factory=CreatureModelInfo,
    )
    item_template: ItemTemplate = Field(default_factory=ItemTemplate)


class ResourceBase(BaseModel):
    id: int
    model_folder: str
    preview_image: str | None = None
    debug_passed: bool = False
    added: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    drop: DropInfo = Field(default_factory=DropInfo)
    official_db: OfficialDbInfo = Field(default_factory=OfficialDbInfo)
    dbc: DbcInfo = Field(default_factory=DbcInfo)
    db: DbInfo = Field(default_factory=DbInfo)


class Mount(ResourceBase):
    resource_type: Literal["mount"] = "mount"
    mount_type: str | None = None
    star_rating: str | None = None
    subtype: str | None = None


class Pet(ResourceBase):
    resource_type: Literal["pet"] = "pet"
    rarity: str | None = None


class Npc(ResourceBase):
    resource_type: Literal["npc"] = "npc"
    rarity: str | None = None


Resource = Annotated[Mount | Pet | Npc, Field(discriminator="resource_type")]


# 兼容仍需要 plain union 的场景（如函数返回类型注解）
ResourceUnion = Mount | Pet | Npc
