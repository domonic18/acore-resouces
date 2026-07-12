"""资源 REST API 路由。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel

from app.preview.asset_resolver import resolve_resource_assets
from app.schemas.resource import Resource
from app.services.resource_store import list_resources, load_resource, save_resource

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
    mount_type: str | None = None
    star_rating: str | None = None
    subtype: str | None = None
    rarity: str | None = None
    drop: DropUpdate | None = None
    dbc_item: dict[str, Any] | None = None
    dbc_spell: dict[str, Any] | None = None
    db_item_template: dict[str, Any] | None = None
    db_creature_template: dict[str, Any] | None = None
    debug_passed: bool | None = None
    added: bool | None = None


def _resource_to_dict(resource: Resource) -> dict[str, Any]:
    data = resource.model_dump()
    data["name"] = resource.official_db.name or resource.model_folder
    return data


@router.get("/{resource_type}")
def list_resources_endpoint(
    resource_type: str,
    search: str | None = Query(None, description="关键词搜索"),
    added: bool | None = Query(None, description="是否已添加"),
    debug_passed: bool | None = Query(None, description="是否调试通过"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
) -> dict[str, Any]:
    """分页列出资源。"""
    resources = list_resources(resource_type)

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

    total = len(resources)
    start = (page - 1) * page_size
    end = start + page_size
    items = resources[start:end]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_resource_to_dict(r) for r in items],
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
        resource.dbc.item = body.dbc_item or {}
    if "dbc_spell" in body.model_fields_set:
        resource.dbc.spell = body.dbc_spell or {}
    if "db_item_template" in body.model_fields_set:
        resource.db.item_template = body.db_item_template or {}
    if "db_creature_template" in body.model_fields_set:
        resource.db.creature_template = body.db_creature_template or {}
    if "debug_passed" in body.model_fields_set:
        resource.debug_passed = body.debug_passed or False
    if "added" in body.model_fields_set:
        resource.added = body.added or False

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
    }
