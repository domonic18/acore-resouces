"""补丁任务 REST API 路由。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import settings
from app.schemas.patch import (
    DistroAdminBatchesOut,
    DistroAdminBatchInfo,
    DistroBatchInfo,
    DistroDeleteResult,
    DistroPushCleaned,
    DistroPushItem,
    DistroPushRequest,
    DistroPushResult,
    DistroStatusOut,
    JobArtifactsOut,
    JobPlansOut,
    MountPatchPreview,
    PatchJobStatus,
    PatchJobUpdateRequest,
    ValidationReportOut,
)
from app.schemas.resource import Mount
from app.services.build_runner import (
    BuildAlreadyRunningError,
    get_build_status,
    run_build,
    start_build,
)
from app.services.mount_patch_builder import MountPatchBuilderError
from app.services.mount_preview import build_mount_preview, build_mount_previews
from app.services.patch_artifacts import load_job_artifacts
from app.services.patch_audit import load_audit_by_job
from app.services.patch_batches import list_patch_batches
from app.services.patch_distro_client import (
    DistroPushError,
    delete_distro_batch,
    fetch_admin_dist_batches,
    fetch_dist_batches,
    is_distro_configured,
    update_distro_batch_meta,
)
from app.services.patch_exporter import (
    create_patch_job,
    delete_patch_job,
    get_patch_job,
    list_patch_jobs,
    update_patch_job_status,
)
from app.services.patch_plans import build_live_plans, load_stored_plans
from app.services.patch_publisher import (
    PatchPublisherError,
    publish_patches,
    push_batches,
)
from app.services.patch_reports import (
    load_validation_report_by_batch,
    load_validation_report_by_job,
)
from app.services.resource_store import load_resource
from app.services.workspace_cleaner import (
    WorkspaceCleanerError,
    clean_workspace,
)

router = APIRouter(prefix="/api/patches", tags=["patches"])


class PatchExportRequest(BaseModel):
    """批量导出补丁原料请求。"""

    resource_type: str
    resource_ids: list[int]


class PatchPreviewBatchRequest(BaseModel):
    """批量补丁预览请求。"""

    resource_ids: list[int] = Field(default_factory=list)


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
    batch_ids: list[str] | None = Field(
        default=None, description="指定要发布的批次；为空则发布所有未发布批次"
    )


@router.post("/build", status_code=202)
def build_patches(background_tasks: BackgroundTasks, body: PatchBuildRequest) -> dict[str, Any]:
    """后台启动补丁构建，立即返回；进度经 /build/status 轮询。"""
    if not body.all_requested and not body.job_ids:
        raise HTTPException(400, "请指定 all_requested 或 job_ids")
    if body.job_ids and body.all_requested:
        raise HTTPException(400, "job_ids 与 all_requested 不能同时指定")
    if body.job_ids:
        missing = [jid for jid in body.job_ids if get_patch_job(jid) is None]
        if missing:
            raise HTTPException(404, f"任务不存在：{', '.join(missing)}")
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


@router.get("/batches")
def list_batches(
    status: PatchJobStatus | None = Query(None, description="批次聚合状态"),
) -> dict[str, Any]:
    """按导出批次（MPQ 构建批次）聚合列出补丁任务。"""
    items = list_patch_batches(status=status)
    return {
        "total": len(items),
        "items": [b.model_dump(exclude_none=False) for b in items],
    }


@router.post("/publish")
def publish(body: PatchPublishRequest) -> dict[str, Any]:
    """发布 MPQ 批次到分发目录（同步执行）。"""
    try:
        return publish_patches(
            start_number=body.start_number,
            dry_run=body.dry_run,
            batch_ids=body.batch_ids,
        )
    except PatchPublisherError as e:
        raise HTTPException(500, f"发布失败: {e}") from e


@router.delete("/batches/{batch_id}")
def delete_batch(batch_id: str) -> dict[str, Any]:
    """删除一个批次下的全部补丁任务。

    仅移除任务目录，不影响真相源与已生成的 DBC/SQL/MPQ 产物。
    """
    batch = next(
        (b for b in list_patch_batches() if b.batch_id == batch_id), None
    )
    if batch is None or not batch.jobs:
        raise HTTPException(404, f"批次 {batch_id} 下没有可删除的任务")

    deleted = []
    for job in batch.jobs:
        try:
            if delete_patch_job(job.job_id):
                deleted.append(job.job_id)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        except BuildAlreadyRunningError as e:
            raise HTTPException(409, str(e)) from e
    return {"deleted": deleted, "batch": batch_id, "total": len(deleted)}


class WorkspaceCleanRequest(BaseModel):
    """工作区中间产物清理请求。"""

    execute: bool = False
    older_than_days: int | None = None
    include_published: bool = False


@router.post("/clean")
def clean(body: WorkspaceCleanRequest) -> dict[str, Any]:
    """预览或清理工作区中间产物（默认仅预览）。"""
    if body.older_than_days is not None and body.older_than_days < 0:
        raise HTTPException(400, "older_than_days 不能为负数")
    try:
        return clean_workspace(
            execute=body.execute,
            older_than_days=body.older_than_days,
            include_published=body.include_published,
        )
    except WorkspaceCleanerError as e:
        raise HTTPException(409, str(e)) from e


@router.get("/preview/{resource_type}/{resource_id}", response_model=MountPatchPreview)
def preview_patch(resource_type: str, resource_id: int) -> MountPatchPreview:
    """坐骑补丁预览（所见即所得）。

    纯读：在创建补丁任务之前计算「这次构建会往 DBC/SQL 写入什么」，
    并列出关联不一致、ID 冲突、资源缺失等问题，不落盘。
    """
    resource = load_resource(resource_type, resource_id)
    if resource is None:
        raise HTTPException(404, f"未找到 {resource_type} ID={resource_id}")
    if resource.resource_type != "mount":
        raise HTTPException(400, "第一阶段仅支持 mount 类型")
    return build_mount_preview(resource)


@router.post("/preview/batch", response_model=list[MountPatchPreview])
def preview_patch_batch(body: PatchPreviewBatchRequest) -> list[MountPatchPreview]:
    """批量坐骑补丁预览。

    与逐个调用 /preview/{type}/{id} 等价，但共享 DBC 占用 ID 缓存——
    每个 DBC 文件只加载一次。
    """
    if not body.resource_ids:
        raise HTTPException(400, "resource_ids 不能为空")
    if len(body.resource_ids) > 100:
        raise HTTPException(400, "一次最多预览 100 个资源")

    resources: list[Mount] = []
    missing = []
    for rid in body.resource_ids:
        resource = load_resource("mount", rid)
        if resource is None:
            missing.append(rid)
        elif resource.resource_type == "mount":
            resources.append(resource)
    if missing:
        raise HTTPException(404, f"未找到坐骑：{', '.join(str(m) for m in missing)}")

    return build_mount_previews(resources)


@router.post("/distro-push", response_model=DistroPushResult)
def distro_push(body: DistroPushRequest) -> DistroPushResult:
    """把已发布批次推送到分发端。

    与「本地发布」是**两个独立动作**：本地发布只是改名移位（可反悔），
    推送才会让补丁对玩家可见、公告同步发布——不可撤销，因此必须显式触发。
    """
    try:
        result = push_batches(
            batch_ids=body.batch_ids or None, dry_run=body.dry_run
        )
    except PatchPublisherError as e:
        return DistroPushResult(configured=False, reachable=False, error=str(e))
    except DistroPushError as e:
        return DistroPushResult(reachable=False, error=str(e))

    return DistroPushResult(
        pushed=list(result["pushed"]),
        failed=[
            DistroPushItem(batch=item["batch"], error=item.get("error"))
            for item in result["failed"]
        ],
        preview=[
            DistroPushItem(
                batch=item["batch"],
                path=item.get("path"),
                patch_number=item.get("patch_number"),
                size_bytes=item.get("size_bytes"),
            )
            for item in result["preview"]
        ],
        cleaned=[
            DistroPushCleaned(
                batch=item["batch"], freed_bytes=int(item.get("freed_bytes") or 0)
            )
            for item in result.get("cleaned", [])
        ],
    )


@router.get("/distro/status", response_model=DistroStatusOut)
def distro_status() -> DistroStatusOut:
    """对比本地已发布批次与分发端已推送批次。"""
    local = sorted(
        d.name
        for d in settings.workspace_dir.joinpath("dist").iterdir()
        if d.is_dir() and list(d.glob("patch-zhCN-*.mpq"))
    ) if settings.workspace_dir.joinpath("dist").exists() else []

    try:
        details = fetch_dist_batches()
    except DistroPushError as e:
        return DistroStatusOut(
            local_batches=local, reachable=False, error=str(e)
        )

    pushed = sorted(d["batch"] for d in details)
    return DistroStatusOut(
        local_batches=local,
        pushed_batches=pushed,
        pending_batches=[b for b in local if b not in pushed],
        pushed_details=[
            DistroBatchInfo(
                batch=d["batch"],
                patch_number=d.get("patch_number"),
                patch_file=d.get("patch_file"),
                size_bytes=d.get("size_bytes"),
                mount_count=d.get("mount_count"),
                file_count=d.get("file_count"),
                generated_at=d.get("generated_at"),
            )
            for d in details
        ],
    )


@router.get("/distro/batches", response_model=DistroAdminBatchesOut)
def distro_admin_batches() -> DistroAdminBatchesOut:
    """分发端全部批次（含 pending 与失败残留），admin 视角。"""
    if not is_distro_configured():
        return DistroAdminBatchesOut(reachable=False, error="分发端未配置")
    try:
        batches = fetch_admin_dist_batches()
    except DistroPushError as e:
        return DistroAdminBatchesOut(reachable=False, error=str(e))
    return DistroAdminBatchesOut(batches=[DistroAdminBatchInfo.model_validate(b) for b in batches])


@router.delete("/distro/batches/{batch}", response_model=DistroDeleteResult)
def distro_delete_batch(batch: str) -> DistroDeleteResult:
    """删除分发端上的批次——玩家将不再能下载该补丁。

    与本地删除是两件事：本地副本清理后玩家仍能从分发端拿到补丁，
    这个端点才是「从分发端下线」的那一步。
    """
    if not is_distro_configured():
        return DistroDeleteResult(batch=batch, reachable=False, error="分发端未配置")
    try:
        result = delete_distro_batch(batch)
    except DistroPushError as e:
        return DistroDeleteResult(batch=batch, reachable=False, error=str(e))
    return DistroDeleteResult(
        batch=str(result.get("batch") or batch),
        existed=bool(result.get("existed")),
        freed_bytes=int(result.get("freed_bytes") or 0),
    )


class DistroMetaUpdateRequest(BaseModel):
    """更新分发端批次元数据的请求。"""

    changelog: str | None = None
    mount_count: int | None = Field(None, ge=0)
    file_count: int | None = Field(None, ge=0)
    generated_at: str | None = None


@router.patch("/distro/batches/{batch}")
def distro_update_batch_meta(batch: str, body: DistroMetaUpdateRequest) -> dict[str, Any]:
    """改分发端批次的元数据（如 changelog），不动 MPQ、不改可见性。"""
    if not is_distro_configured():
        raise HTTPException(502, "分发端未配置")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "没有要更新的字段")
    try:
        return update_distro_batch_meta(batch, updates)
    except DistroPushError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/reports/{batch}/validation-report", response_model=ValidationReportOut)
def get_batch_validation_report(batch: str) -> ValidationReportOut:
    """按批次读取校验报告。"""
    try:
        return load_validation_report_by_batch(batch)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@router.get("/jobs/{job_id}/validation-report", response_model=ValidationReportOut)
def get_job_validation_report(job_id: str) -> ValidationReportOut:
    """按任务读取校验报告切片。"""
    try:
        return load_validation_report_by_job(job_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@router.get("/jobs/{job_id}/plans", response_model=JobPlansOut)
def get_job_plans(
    job_id: str,
    source: str = Query(
        "stored", pattern="^(stored|live)$", description="读 dry-run 落盘计划或现场重算"
    ),
) -> JobPlansOut:
    """读取补丁任务的 DBC/SQL 生成计划。"""
    try:
        if source == "live":
            return build_live_plans(job_id)
        return load_stored_plans(job_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except MountPatchBuilderError as e:
        raise HTTPException(409, str(e)) from e


@router.get("/jobs/{job_id}/artifacts", response_model=JobArtifactsOut)
def get_job_artifacts(job_id: str) -> JobArtifactsOut:
    """读取补丁任务的产物清单（含可下载链接）。"""
    try:
        return load_job_artifacts(job_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


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


@router.delete("/{job_id}")
def delete_job(job_id: str) -> dict[str, Any]:
    """删除单个补丁任务（仅移除任务目录，不影响真相源与已生成产物）。"""
    try:
        deleted = delete_patch_job(job_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except BuildAlreadyRunningError as e:
        raise HTTPException(409, str(e)) from e
    if not deleted:
        raise HTTPException(404, f"任务 {job_id} 不存在")
    return {"deleted": True, "job_id": job_id}
