"""资源 REST API 路由。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.preview.asset_resolver import resolve_resource_assets
from app.schemas.dbc import CreatureDisplayInfo, CreatureModelData, Item, Spell
from app.schemas.resource import Resource
from app.schemas.sql import CreatureTemplate, ItemTemplate
from app.services.resource_store import list_resources, load_resource, save_resource
from app.services.resource_validation import (
    DuplicateIdIssue,
    check_duplicate_resource_ids,
)

router = APIRouter(prefix="/api/resources", tags=["resources"])


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
    mount_type: str | None = None
    star_rating: str | None = None
    subtype: str | None = None
    rarity: str | None = None
    drop: DropUpdate | None = None
    dbc_item: Item | None = None
    dbc_spell: Spell | None = None
    dbc_creature_model_data: CreatureModelData | None = None
    dbc_creature_display_info: CreatureDisplayInfo | None = None
    db_item_template: ItemTemplate | None = None
    db_creature_template: CreatureTemplate | None = None
    debug_passed: bool | None = None
    added: bool | None = None


def _resource_key(resource: Resource) -> tuple[int, str]:
    return (resource.id, resource.model_folder)


def _build_duplicate_issue_map(
    resources: list[Resource],
    issues: list[DuplicateIdIssue],
) -> dict[tuple[int, str], list[dict[str, Any]]]:
    """将重复问题按资源 key 分组，并过滤掉自身。"""
    resource_by_key = {_resource_key(r): r for r in resources}
    mapping: dict[tuple[int, str], list[dict[str, Any]]] = {}
    for issue in issues:
        for res_key in issue.resources:
            conflicts = []
            for other_key in issue.resources:
                if other_key == res_key:
                    continue
                other_resource = resource_by_key.get(other_key)
                conflicts.append(
                    {
                        "id": other_key[0],
                        "resource_type": "mount",
                        "model_folder": other_key[1],
                        "name": other_resource.official_db.name if other_resource else None,
                    }
                )
            mapping.setdefault(res_key, []).append(
                {
                    "field": issue.field.path,
                    "value": issue.value,
                    "resources": conflicts,
                }
            )
    return mapping


def _resource_to_dict(
    resource: Resource,
    duplicate_issues: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    data = resource.model_dump(by_alias=True)
    data["name"] = resource.official_db.name or resource.model_folder
    data["duplicate_issues"] = duplicate_issues or []
    return data


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
    if key == "id":
        try:
            return int(value)
        except (ValueError, TypeError):
            return value
    if key == "flags":
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


@router.get("/{resource_type}")
def list_resources_endpoint(
    resource_type: str,
    search: str | None = Query(None, description="关键词搜索"),
    added: bool | None = Query(None, description="是否已添加"),
    debug_passed: bool | None = Query(None, description="是否调试通过"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    sort_by: str | None = Query(None, description="排序字段，如 updated_at"),
    sort_order: str = Query("desc", description="排序方向：asc 或 desc"),
) -> dict[str, Any]:
    """分页列出资源。"""
    resources = list_resources(resource_type)

    duplicate_issue_map: dict[tuple[int, str], list[dict[str, Any]]] = {}
    if resource_type == "mount":
        duplicate_issue_map = _build_duplicate_issue_map(
            resources,
            check_duplicate_resource_ids(resources),
        )

    if search:
        search_lower = search.lower()
        resources = [
            r
            for r in resources
            if search_lower in r.model_folder.lower()
            or (r.official_db.name and search_lower in r.official_db.name.lower())
        ]

    if added is not None:
        resources = [r for r in resources if r.added == added]
    if debug_passed is not None:
        resources = [r for r in resources if r.debug_passed == debug_passed]

    if sort_by:
        reverse = sort_order.lower() == "desc"

        def _sort_key(r: Resource) -> tuple[bool, Any]:
            value = getattr(r, sort_by, None)
            return (value is None, value)

        resources.sort(key=_sort_key, reverse=reverse)

    total = len(resources)
    start = (page - 1) * page_size
    end = start + page_size
    items = resources[start:end]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            _resource_to_dict(
                r,
                duplicate_issue_map.get(_resource_key(r)),
            )
            for r in items
        ],
    }


@router.get("/{resource_type}/{resource_id}")
def get_resource_endpoint(
    resource_type: str,
    resource_id: int,
) -> dict[str, Any]:
    """获取单个资源详情。"""
    resource = load_resource(resource_type, resource_id)
    if not resource:
        raise HTTPException(
            status_code=404,
            detail=f"未找到 {resource_type} ID={resource_id}",
        )
    return _resource_to_dict(resource)


@router.put("/{resource_type}/{resource_id}")
def update_resource_endpoint(
    resource_type: str,
    resource_id: int,
    body: ResourceUpdateRequest,
) -> dict[str, Any]:
    """更新资源基础字段。"""
    resource = load_resource(resource_type, resource_id)
    if not resource:
        raise HTTPException(
            status_code=404,
            detail=f"未找到 {resource_type} ID={resource_id}",
        )

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
    if "mount_type" in body.model_fields_set and resource.resource_type == "mount":
        resource.mount_type = body.mount_type
    if "star_rating" in body.model_fields_set and resource.resource_type == "mount":
        resource.star_rating = body.star_rating
    if "subtype" in body.model_fields_set and resource.resource_type == "mount":
        resource.subtype = body.subtype
    if "rarity" in body.model_fields_set and resource.resource_type in ("pet", "npc"):
        resource.rarity = body.rarity
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
        raise HTTPException(
            status_code=400,
            detail={
                "error": "duplicate_id",
                "issues": [
                    {
                        "field": issue.field.path,
                        "value": issue.value,
                        "resources": [
                            f"{resource_id:04d}-{model_folder}"
                            for resource_id, model_folder in issue.resources
                        ],
                    }
                    for issue in duplicate_issues
                ],
            },
        )

    save_resource(resource)
    return _resource_to_dict(resource)


@router.put("/{resource_type}/{resource_id}/icon")
def update_resource_icon(
    resource_type: str,
    resource_id: int,
    body: IconUpdateRequest,
) -> dict[str, Any]:
    """更新资源的图标字段。"""
    resource = load_resource(resource_type, resource_id)
    if not resource:
        raise HTTPException(
            status_code=404,
            detail=f"未找到 {resource_type} ID={resource_id}",
        )
    resource.official_db.icon_name = body.icon_name
    resource.official_db.spell_icon_name = body.icon_name
    save_resource(resource)
    return _resource_to_dict(resource)


@router.get("/{resource_type}/{resource_id}/assets")
def get_resource_assets_endpoint(
    resource_type: str,
    resource_id: int,
) -> dict[str, Any]:
    """获取指定资源的文件树、贴图关联与图标。"""
    resource = load_resource(resource_type, resource_id)
    if not resource:
        raise HTTPException(
            status_code=404,
            detail=f"未找到 {resource_type} ID={resource_id}",
        )

    assets = resolve_resource_assets(resource)
    return {
        "model_folder": assets.model_folder,
        "resource_dir": str(assets.resource_dir),
        "exists": assets.resource_dir.exists(),
        "m2_files": [
            {"name": f.name, "relative_path": f.relative_path, "file_type": f.file_type}
            for f in assets.m2_files
        ],
        "texture_files": [
            {"name": f.name, "relative_path": f.relative_path, "file_type": f.file_type}
            for f in assets.texture_files
        ],
        "image_files": [
            {"name": f.name, "relative_path": f.relative_path, "file_type": f.file_type}
            for f in assets.image_files
        ],
        "icon_files": [
            {"name": f.name, "relative_path": f.relative_path, "file_type": f.file_type}
            for f in assets.icon_files
        ],
        "matched_textures": [
            {"name": f.name, "relative_path": f.relative_path, "file_type": f.file_type}
            for f in assets.matched_textures
        ],
        "anim_files": [
            {"name": f.name, "relative_path": f.relative_path, "file_type": f.file_type}
            for f in assets.anim_files
        ],
    }
