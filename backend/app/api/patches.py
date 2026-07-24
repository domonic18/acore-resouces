"""补丁任务 REST API 路由。"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.patch_exporter import (
    create_patch_job,
    get_patch_job,
    list_patch_jobs,
    update_patch_job_status,
)

router = APIRouter(prefix="/api/patches", tags=["patches"])


class PatchExportRequest(BaseModel):
    """批量导出补丁原料请求。"""

    resource_type: str
    resource_ids: list[int]


class PatchJobUpdateRequest(BaseModel):
    """更新补丁任务状态请求。"""

    status: Literal["requested", "generated", "applied", "failed"] | None = None
    artifacts: dict[str, str] | None = None
    summary: str | None = None


@router.post("/export-request")
def export_request(body: PatchExportRequest) -> dict[str, Any]:
    """批量导出补丁原料包。

    第一阶段仅支持 mount 类型。
    """
    if body.resource_type != "mount":
        raise HTTPException(400, "第一阶段仅支持 mount 类型")
    if not body.resource_ids:
        raise HTTPException(400, "resource_ids 不能为空")

    jobs = []
    for rid in body.resource_ids:
        try:
            jobs.append(create_patch_job(body.resource_type, rid))
        except ValueError as e:
            raise HTTPException(400, f"资源 {rid} 导出失败: {e}") from e

    return {
        "jobs": [j.model_dump(exclude_none=False) for j in jobs],
        "total": len(jobs),
    }


@router.get("")
def list_jobs(
    resource_type: str | None = Query(None, description="资源类型"),
    resource_id: int | None = Query(None, description="资源 ID"),
    status: str | None = Query(None, description="任务状态"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
) -> dict[str, Any]:
    """分页列出补丁任务。"""
    return list_patch_jobs(
        resource_type=resource_type,
        resource_id=resource_id,
        status=status,
        page=page,
        page_size=page_size,
    )


@router.get("/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    """获取单个补丁任务详情。"""
    manifest = get_patch_job(job_id)
    if manifest is None:
        raise HTTPException(404, f"任务 {job_id} 不存在")
    return manifest.model_dump(exclude_none=False)


@router.put("/{job_id}")
def update_job(job_id: str, body: PatchJobUpdateRequest) -> dict[str, Any]:
    """更新补丁任务状态与产物信息。"""
    manifest = update_patch_job_status(
        job_id,
        status=body.status or "requested",
        output_artifacts=body.artifacts,
        summary=body.summary,
    )
    if manifest is None:
        raise HTTPException(404, f"任务 {job_id} 不存在")
    return manifest.model_dump(exclude_none=False)
