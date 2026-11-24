"""资源字段更新服务。

负责把 ResourceUpdateRequest 的「部分更新」语义合并到资源对象上：
仅处理请求中显式提供的字段（model_fields_set），按资源类型门控，
并在落盘前执行全局重复 ID 校验。
"""

from __future__ import annotations

from typing import Any

from app.schemas.dbc import CreatureDisplayInfo, CreatureModelData, Item, Spell
from app.schemas.resource import Resource
from app.schemas.resource_update import ResourceUpdateRequest
from app.schemas.sql import CreatureTemplate, ItemTemplate
from app.services.resource_store import list_resources, load_resource, save_resource
from app.services.resource_validation import check_duplicate_resource_ids


class ResourceNotFoundError(Exception):
    """资源不存在。"""

    def __init__(self, resource_type: str, resource_id: int) -> None:
        self.resource_type = resource_type
        self.resource_id = resource_id
        super().__init__(f"未找到 {resource_type} ID={resource_id}")


class DuplicateResourceIdError(Exception):
    """更新会引入与其他资源的全局唯一 ID 冲突。"""

    def __init__(self, issues: list[dict[str, Any]]) -> None:
        self.issues = issues
        super().__init__("duplicate_id")


def _normalize_display_info_value(key: str, value: Any) -> Any:
    """归一化 creature_display_info 字段值类型。"""
    if value is None or value == "":
        return None
    if key in ("scale", "creature_model_scale"):
        try:
            return float(value)
        except (ValueError, TypeError):
            return value
    int_fields = {
        "id",
        "model_id",
        "sound_id",
        "extra_display_information_id",
        "opacity",
        "creature_model_alpha",
        "size_class",
        "blood_id",
        "npc_sound_id",
        "particle_color_id",
        "creature_geoset_data",
        "object_effect_package_id",
    }
    if key in int_fields:
        try:
            return int(value)
        except (ValueError, TypeError):
            return value
    return value


def _normalize_model_data_value(key: str, value: Any) -> Any:
    """归一化 creature_model_data 字段值类型。"""
    if value is None:
        return None
    if key == "model_name":
        return str(value)
    if key in ("id", "flags"):
        try:
            return int(value)
        except (ValueError, TypeError):
            return value
    float_fields = {
        "model_scale",
        "collision_width",
        "collision_height",
        "mount_height",
    }
    if key in float_fields:
        try:
            return float(value)
        except (ValueError, TypeError):
            return value
    return value


def update_resource_fields(
    resource_type: str,
    resource_id: int,
    body: ResourceUpdateRequest,
) -> Resource:
    """按部分更新语义合并字段并落盘。

    Raises:
        ResourceNotFoundError: 资源不存在。
        DuplicateResourceIdError: 更新后与其他资源存在全局唯一 ID 冲突。
    """
    resource = load_resource(resource_type, resource_id)
    if not resource:
        raise ResourceNotFoundError(resource_type, resource_id)

    if "name" in body.model_fields_set:
        resource.official_db.name = body.name
    if "icon_name" in body.model_fields_set:
        resource.official_db.icon_name = body.icon_name
    if "spell_icon_name" in body.model_fields_set:
        resource.official_db.spell_icon_name = body.spell_icon_name
    if "spell_wowhead_url" in body.model_fields_set:
        resource.official_db.spell_wowhead_url = body.spell_wowhead_url
    if "item_wowhead_url" in body.model_fields_set:
        resource.official_db.item_wowhead_url = body.item_wowhead_url
    if "notes" in body.model_fields_set:
        resource.notes = body.notes or None
    if "mount_type" in body.model_fields_set and resource.resource_type == "mount":
        resource.mount_type = body.mount_type
    if "star_rating" in body.model_fields_set and resource.resource_type == "mount":
        resource.star_rating = body.star_rating
    if "subtype" in body.model_fields_set and resource.resource_type in ("mount", "pet", "npc"):
        resource.subtype = body.subtype
    if "special_features" in body.model_fields_set and resource.resource_type == "mount":
        resource.special_features = body.special_features or []
    if "vehicle" in body.model_fields_set and resource.resource_type == "mount":
        resource.vehicle = body.vehicle
    if "rarity" in body.model_fields_set and resource.resource_type in ("pet", "npc"):
        resource.rarity = body.rarity
    if "pet_type" in body.model_fields_set and resource.resource_type == "pet":
        resource.pet_type = body.pet_type
    if "npc_type" in body.model_fields_set and resource.resource_type == "npc":
        resource.npc_type = body.npc_type
    if "tags" in body.model_fields_set:
        resource.tags = body.tags or []
    if "drop" in body.model_fields_set and body.drop is not None:
        if "entry" in body.drop.model_fields_set:
            resource.drop.entry = body.drop.entry
        if "instance" in body.drop.model_fields_set:
            resource.drop.instance = body.drop.instance
        if "boss" in body.drop.model_fields_set:
            resource.drop.boss = body.drop.boss
        if "rate" in body.drop.model_fields_set:
            resource.drop.rate = body.drop.rate
    if "dbc_item" in body.model_fields_set:
        resource.dbc.item = body.dbc_item or Item()
    if "dbc_spell" in body.model_fields_set:
        resource.dbc.spell = body.dbc_spell or Spell()
    if "dbc_creature_model_data" in body.model_fields_set:
        model_data_update = (
            body.dbc_creature_model_data.model_dump() if body.dbc_creature_model_data else {}
        )
        existing = resource.dbc.creature_model_data.model_dump()
        merged = {**existing}
        for key, value in model_data_update.items():
            if key == "id":
                continue
            merged[key] = _normalize_model_data_value(key, value)
        resource.dbc.creature_model_data = CreatureModelData(**merged)
    if "dbc_creature_display_info" in body.model_fields_set:
        display_info_update = (
            body.dbc_creature_display_info.model_dump() if body.dbc_creature_display_info else {}
        )
        existing = resource.dbc.creature_display_info.model_dump()
        merged = {**existing}
        for key, value in display_info_update.items():
            if key in ("id", "model_id"):
                continue
            merged[key] = _normalize_display_info_value(key, value)
        resource.dbc.creature_display_info = CreatureDisplayInfo(**merged)
    if "db_item_template" in body.model_fields_set:
        resource.db.item_template = body.db_item_template or ItemTemplate()
    if "db_creature_template" in body.model_fields_set:
        resource.db.creature_template = body.db_creature_template or CreatureTemplate()
    if "debug_passed" in body.model_fields_set:
        resource.debug_passed = body.debug_passed or False
    if "added" in body.model_fields_set:
        resource.added = body.added or False

    duplicate_issues = check_duplicate_resource_ids(
        [r for r in list_resources("mount") if r.id != resource.id] + [resource],
        focus_resource=resource,
    )
    if duplicate_issues:
        raise DuplicateResourceIdError(
            [
                {
                    "field": issue.field.path,
                    "value": issue.value,
                    "resources": [
                        f"{other_id:04d}-{model_folder}"
                        for other_id, model_folder in issue.resources
                    ],
                }
                for issue in duplicate_issues
            ]
        )

    save_resource(resource)
    return resource
