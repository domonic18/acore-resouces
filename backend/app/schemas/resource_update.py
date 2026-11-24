"""资源字段更新请求模型。

REST API 与服务层共用的 DTO：字段集与「部分更新」语义（未传字段不改动）
保持一致，资源类型相关的字段由服务层按 resource.type 门控写入。
"""

from __future__ import annotations

from pydantic import BaseModel

from app.schemas.dbc import CreatureDisplayInfo, CreatureModelData, Item, Spell
from app.schemas.sql import CreatureTemplate, ItemTemplate
from app.schemas.vehicle import VehicleConfig


class IconUpdateRequest(BaseModel):
    icon_name: str


class DropUpdate(BaseModel):
    entry: int | None = None
    instance: str | None = None
    boss: str | None = None
    rate: float | None = None


class ResourceUpdateRequest(BaseModel):
    name: str | None = None
    icon_name: str | None = None
    spell_icon_name: str | None = None
    spell_wowhead_url: str | None = None
    item_wowhead_url: str | None = None
    notes: str | None = None
    mount_type: str | None = None
    star_rating: str | None = None
    subtype: str | None = None
    special_features: list[str] | None = None
    vehicle: VehicleConfig | None = None
    rarity: str | None = None
    pet_type: str | None = None
    npc_type: str | None = None
    tags: list[str] | None = None
    drop: DropUpdate | None = None
    dbc_item: Item | None = None
    dbc_spell: Spell | None = None
    dbc_creature_model_data: CreatureModelData | None = None
    dbc_creature_display_info: CreatureDisplayInfo | None = None
    db_item_template: ItemTemplate | None = None
    db_creature_template: CreatureTemplate | None = None
    debug_passed: bool | None = None
    added: bool | None = None
