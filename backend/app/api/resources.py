"""资源 REST API 路由。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.preview.asset_resolver import resolve_resource_assets
from app.schemas.resource import Resource
from app.services.resource_store import list_resources, load_resource

router = APIRouter(prefix="/api/resources", tags=["resources"])


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
