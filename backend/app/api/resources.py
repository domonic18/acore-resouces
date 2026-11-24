"""资源 REST API 路由。"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query

from app.preview.asset_resolver import resolve_resource_assets
from app.schemas.flow import ResourceFlowState, ResourceRelationshipReport
from app.schemas.resource import Resource
from app.schemas.resource_update import IconUpdateRequest, ResourceUpdateRequest
from app.services.mount_flow import get_mount_flow_state
from app.services.resource_store import list_resources, load_resource, save_resource
from app.services.resource_update import (
    DuplicateResourceIdError,
    ResourceNotFoundError,
    update_resource_fields,
)
from app.services.resource_validation import (
    build_duplicate_issue_map,
    check_duplicate_resource_ids,
    check_resource_relationships,
    compute_required_fields,
    duplicate_issues_to_out,
    relationship_checks_to_out,
    resource_key,
)

router = APIRouter(prefix="/api/resources", tags=["resources"])


def _resource_to_dict(
    resource: Resource,
    duplicate_issues: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    data = resource.model_dump(by_alias=True)
    data["name"] = resource.official_db.name or resource.model_folder
    data["duplicate_issues"] = duplicate_issues or []
    return data


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
        duplicate_issue_map = build_duplicate_issue_map(
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
            or (r.notes and search_lower in r.notes.lower())
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
                duplicate_issue_map.get(resource_key(r)),
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


@router.get(
    "/{resource_type}/{resource_id}/relationships", response_model=ResourceRelationshipReport
)
def get_resource_relationships(
    resource_type: str,
    resource_id: int,
) -> ResourceRelationshipReport:
    """获取资源的跨数据源关联校验结果与全局唯一 ID 冲突。

    这是关联校验的唯一实现入口——CLI 与界面共用同一份判定口径。
    """
    resource = load_resource(resource_type, resource_id)
    if resource is None:
        raise HTTPException(404, f"未找到 {resource_type} ID={resource_id}")

    relationships = relationship_checks_to_out(check_resource_relationships(resource))
    all_resources = list_resources(resource_type)
    duplicates = duplicate_issues_to_out(
        check_duplicate_resource_ids(all_resources, focus_resource=resource),
        all_resources,
    )
    required_fields = compute_required_fields(resource)

    overall: Literal["ok", "mismatch", "missing"]
    if relationships and all(check.status == "ok" for check in relationships):
        overall = "ok"
    elif any(check.status == "mismatch" for check in relationships):
        overall = "mismatch"
    else:
        overall = "missing"

    return ResourceRelationshipReport(
        resource_type=resource_type,
        resource_id=resource_id,
        overall_status=overall,
        relationships=relationships,
        duplicates=duplicates,
        required_fields=required_fields,
    )


@router.get("/{resource_type}/{resource_id}/flow", response_model=ResourceFlowState)
def get_resource_flow(
    resource_type: str,
    resource_id: int,
) -> ResourceFlowState:
    """获取资源在坐骑生产流程中的位置与各步状态。"""
    resource = load_resource(resource_type, resource_id)
    if resource is None:
        raise HTTPException(404, f"未找到 {resource_type} ID={resource_id}")
    if resource.resource_type != "mount":
        raise HTTPException(400, "第一阶段仅支持 mount 类型")
    return get_mount_flow_state(resource)


@router.put("/{resource_type}/{resource_id}")
def update_resource_endpoint(
    resource_type: str,
    resource_id: int,
    body: ResourceUpdateRequest,
) -> dict[str, Any]:
    """更新资源基础字段。"""
    try:
        resource = update_resource_fields(resource_type, resource_id, body)
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DuplicateResourceIdError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "duplicate_id", "issues": exc.issues},
        ) from exc
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
