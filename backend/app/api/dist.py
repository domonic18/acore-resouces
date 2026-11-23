"""玩家补丁下载与管理路由（分发站能力并入本系统）。

玩家端点仅需登录（viewer 即玩家）；批次管理端点仅 admin。
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.security import AuthUser, require_admin
from app.services.dist_site import (
    BATCH_NAME_RE,
    BatchNotFoundError,
    DistSiteError,
    build_dist_tree,
    delete_batch,
    get_batch,
    list_admin_batches,
    read_changelog,
    resolve_download,
    update_batch_meta,
)

router = APIRouter(prefix="/api/dist", tags=["dist"])


@router.get("/tree")
def dist_tree() -> dict[str, Any]:
    """玩家下载树：批次目录 + MPQ 文件节点。"""
    return build_dist_tree()


@router.get("/changelog/{batch}")
def dist_changelog(batch: str) -> dict[str, str]:
    """批次玩家公告（Markdown）。"""
    try:
        content = read_changelog(batch)
    except BatchNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    return {"batch": batch, "changelog": content}


@router.get("/download/{path:path}")
def dist_download(path: str) -> FileResponse:
    """下载 dist 下的 MPQ 补丁（attachment）。

    路径穿越、目录与非 .mpq 一律拒绝；浏览器 <a href> 下载经 ?token= 兜底鉴权。
    """
    try:
        target = resolve_download(path)
    except DistSiteError as e:
        raise HTTPException(403, str(e)) from e
    return FileResponse(target, media_type="application/octet-stream", filename=target.name)


class DistBatchOut(BaseModel):
    """一个分发批次摘要。"""

    batch: str
    obfuscation: str | None = None
    generated_at: str | None = None
    mount_count: int | None = None
    file_count: int | None = None
    patch_number: int | None = None
    patch_file: str | None = None
    size_bytes: int | None = None
    md5: str | None = None
    sha256: str | None = None
    has_mpq: bool = False
    has_changelog: bool = False


class DistAdminBatchesOut(BaseModel):
    """admin 视角批次清单（含未上架目录与孤儿目录）。"""

    batches: list[DistBatchOut] = Field(default_factory=list)
    orphans: list[str] = Field(default_factory=list)


@router.get("/batches", response_model=DistAdminBatchesOut)
def dist_admin_batches(user: AuthUser = Depends(require_admin)) -> DistAdminBatchesOut:
    """全部批次（含未上架/损坏），admin 视角。"""
    data = list_admin_batches()
    return DistAdminBatchesOut(
        batches=[DistBatchOut.model_validate(b) for b in data["batches"]],
        orphans=list(data["orphans"]),
    )


def _require_valid_batch(batch: str) -> None:
    if not BATCH_NAME_RE.match(batch):
        raise HTTPException(404, f"非法批次名：{batch}")


class DistMetaUpdateRequest(BaseModel):
    """更新批次元数据请求。"""

    changelog: str | None = None
    mount_count: int | None = Field(None, ge=0)
    file_count: int | None = Field(None, ge=0)
    generated_at: str | None = None


@router.patch("/batches/{batch}")
def dist_update_batch_meta(
    batch: str,
    body: DistMetaUpdateRequest,
    user: AuthUser = Depends(require_admin),
) -> dict[str, Any]:
    """改批次元数据（changelog 等），不动 MPQ。"""
    _require_valid_batch(batch)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "没有要更新的字段")
    try:
        return update_batch_meta(batch, updates)
    except BatchNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except DistSiteError as e:
        raise HTTPException(409, str(e)) from e


@router.delete("/batches/{batch}")
def dist_delete_batch(batch: str, user: AuthUser = Depends(require_admin)) -> dict[str, Any]:
    """下线批次：删除 dist 下整个批次目录，玩家立即不可见。"""
    _require_valid_batch(batch)
    try:
        get_batch(batch)
    except BatchNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    return delete_batch(batch)
