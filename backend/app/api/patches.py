"""补丁任务 REST API 路由。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel

from app.schemas.patch import PatchJobStatus, PatchJobUpdateRequest
from app.services.build_runner import (
    BuildAlreadyRunningError,
    get_build_status,
    run_build,
    start_build,
)
from app.services.patch_audit import load_audit_by_job
from app.services.patch_exporter import (
    create_patch_job,
    get_patch_job,
    list_patch_jobs,
    update_patch_job_status,
)
from app.services.patch_publisher import PatchPublisherError, publish_patches

router = APIRouter(prefix="/api/patches", tags=["patches"])


class PatchExportRequest(BaseModel):
    """批量导出补丁原料请求。"""

    resource_type: str
    resource_ids: list[int]


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
    status: PatchJobStatus | None = Query(None, description="任务状态"),
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


class PatchBuildRequest(BaseModel):
    """补丁构建请求。"""

    all_requested: bool = False
    job_ids: list[str] | None = None
    dry_run: bool = False
    force: bool = False


class PatchPublishRequest(BaseModel):
    """MPQ 发布请求。"""

    start_number: int = 5
    dry_run: bool = False


@router.post("/build", status_code=202)
def build_patches(background_tasks: BackgroundTasks, body: PatchBuildRequest) -> dict[str, Any]:
    """后台启动补丁构建，立即返回；进度经 /build/status 轮询。"""
    if not body.all_requested and not body.job_ids:
        raise HTTPException(400, "请指定 all_requested 或 job_ids")
    try:
        start_build(body.all_requested, body.job_ids, body.dry_run, body.force)
    except BuildAlreadyRunningError as e:
        raise HTTPException(409, str(e)) from e

    background_tasks.add_task(run_build, body.all_requested, body.job_ids, body.dry_run, body.force)
    return {"started": True}


@router.get("/build/status")
def build_status() -> dict[str, Any]:
    """查询构建运行状态与最近一次结果。"""
    return get_build_status()


@router.post("/publish")
def publish(body: PatchPublishRequest) -> dict[str, Any]:
    """发布 MPQ 批次到分发目录（同步执行）。"""
    try:
        return publish_patches(start_number=body.start_number, dry_run=body.dry_run)
    except PatchPublisherError as e:
        raise HTTPException(500, f"发布失败: {e}") from e


@router.get("/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    """获取单个补丁任务详情。"""
    manifest = get_patch_job(job_id)
    if manifest is None:
        raise HTTPException(404, f"任务 {job_id} 不存在")
    return manifest.model_dump(exclude_none=False)


@router.get("/{job_id}/audit")
def get_job_audit(job_id: str) -> dict[str, Any]:
    """获取任务的字段级审计切片（批次报告按 job 过滤）。"""
    try:
        return load_audit_by_job(job_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


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
