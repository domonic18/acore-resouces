from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.dbc import CreatureDisplayInfo, CreatureModelData, Item, Spell
from app.schemas.sql import CreatureModelInfo, CreatureTemplate, ItemTemplate


class DropInfo(BaseModel):
    entry: int | None = None
    instance: str | None = None
    boss: str | None = None
    rate: float | None = None


class OfficialDbInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    spell_icon_name: str | None = None
    icon_name: str | None = None
    spell_wowhead_url: str | None = None
    item_wowhead_url: str | None = None


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
