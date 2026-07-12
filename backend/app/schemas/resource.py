from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class DropInfo(BaseModel):
    entry: int | None = None
    instance: str | None = None
    boss: str | None = None
    rate: float | None = None


class OfficialDbInfo(BaseModel):
    name: str | None = None
    spell_icon_name: str | None = None
    icon_name: str | None = None


class DbcInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    creature_model_data: dict[str, Any] = Field(default_factory=dict)
    creature_display_info: dict[str, Any] = Field(default_factory=dict)
    spell: dict[str, Any] = Field(default_factory=dict)
    item: dict[str, Any] = Field(default_factory=dict)


class DbInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    creature_template: dict[str, Any] = Field(default_factory=dict)
    creature_model_info: dict[str, Any] = Field(default_factory=dict)
    item_template: dict[str, Any] = Field(default_factory=dict)


class ResourceBase(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    model_folder: str
    preview_image: str | None = None
    debug_passed: bool = False
    added: bool = False
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


Resource = Mount | Pet | Npc
