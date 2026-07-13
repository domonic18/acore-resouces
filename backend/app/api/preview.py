"""预览服务 REST API 路由。"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.core.config import settings
from app.preview.asset_resolver import resolve_resource_dir
from app.preview.icon_index import find_icon_path, refresh_icon_index
from app.preview.m2_reader import m2_metadata_to_dict, read_m2_metadata
from app.preview.thumbnail_cache import get_or_create_thumbnail

router = APIRouter(prefix="/api/preview", tags=["preview"])
logger = logging.getLogger(__name__)


def _resolve_source_path(path: str) -> Path:
    """将请求路径解析为项目内的绝对路径，并防止目录穿越。"""
    # 去除可能的 .webp 后缀（缓存路径命中时前端可能误传）
    raw = path
    if raw.endswith(".webp"):
        raw = raw[:-5]

    requested = settings.project_root / raw
    try:
        requested.resolve().relative_to(settings.project_root.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="非法路径") from exc

    return requested


@router.get("/blp/{path:path}")
def preview_blp(
    path: str,
    size: int | None = Query(None, ge=16, le=2048, description="缩略图尺寸"),
) -> FileResponse:
    """预览 .blp 贴图文件，支持生成指定尺寸的 WebP 缩略图。"""
    source_path = _resolve_source_path(path)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在：{path}")

    try:
        if size is None:
            # 原图输出为 WebP
            cache_path = get_or_create_thumbnail(source_path, size=(4096, 4096), quality=95)
        else:
            cache_path = get_or_create_thumbnail(source_path, size=(size, size))
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=f"无法解码 BLP：{exc}") from exc

    return FileResponse(cache_path, media_type="image/webp")


@router.get("/file/{path:path}")
def preview_file(path: str) -> FileResponse:
    """预览任意原始资源文件（图片、GIF 等），按相对路径返回。"""
    source_path = _resolve_source_path(path)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在：{path}")

    media_type = _guess_media_type(source_path.suffix)
    return FileResponse(source_path, media_type=media_type)


def _guess_media_type(suffix: str) -> str | None:
    mapping = {
        ".png": "image/png",
        ".gif": "image/gif",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    return mapping.get(suffix.lower())


@router.get("/icon/{icon_name}")
def preview_icon(
    icon_name: str,
    size: int | None = Query(None, ge=16, le=2048),
) -> FileResponse:
    """根据图标名称预览对应的 .blp 文件。"""
    icon_path = find_icon_path(icon_name)
    if not icon_path or not icon_path.exists():
        raise HTTPException(status_code=404, detail=f"未找到图标：{icon_name}")

    try:
        if size is None:
            cache_path = get_or_create_thumbnail(icon_path, size=(4096, 4096), quality=95)
        else:
            cache_path = get_or_create_thumbnail(icon_path, size=(size, size))
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=f"无法解码图标：{exc}") from exc

    return FileResponse(cache_path, media_type="image/webp")


@router.get("/icons")
def list_icons() -> list[str]:
    """返回所有可用的图标名称列表。"""
    icons = sorted(refresh_icon_index().keys())
    logger.info("/api/preview/icons 返回 %d 个图标", len(icons))
    return icons


@router.get("/model/{model_folder:path}")
def preview_model(
    model_folder: str,
    resource_type: str | None = Query(None, description="资源类型：mount/pet/npc"),
) -> dict[str, Any]:
    """获取 M2 模型元数据、贴图列表与 skin 文件列表，用于前端原生 M2 渲染。"""
    if resource_type is None:
        # 依次尝试 mounts/pets/npcs 定位 model_folder
        for candidate in ("mount", "pet", "npc"):
            resource_dir = resolve_resource_dir(candidate, model_folder)
            m2_files = sorted(resource_dir.rglob("*.m2"))
            if m2_files:
                resource_type = candidate
                break

    if resource_type is None:
        raise HTTPException(status_code=404, detail=f"未找到模型目录：{model_folder}")

    resource_dir = resolve_resource_dir(resource_type, model_folder)
    if not resource_dir.exists():
        raise HTTPException(status_code=404, detail=f"模型目录不存在：{model_folder}")

    m2_files = sorted(resource_dir.rglob("*.m2"))
    if not m2_files:
        return {
            "model_folder": model_folder,
            "resource_type": resource_type,
            "status": "not_found",
            "m2_files": [],
            "skin_files": [],
            "blp_files": [],
            "metadata": None,
            "message": "未找到 .m2 文件",
        }

    # 优先选择主视图 .m2（排除 _lod、_saddle 等变体）
    main_m2 = min(
        (m2 for m2 in m2_files if all(s not in m2.stem.lower() for s in ("_lod", "_saddle"))),
        key=lambda p: len(p.name),
        default=min(m2_files, key=lambda p: len(p.name)),
    )

    skin_files = sorted(resource_dir.rglob("*.skin"))
    blp_files = sorted(resource_dir.rglob("*.blp"))

    try:
        metadata = read_m2_metadata(main_m2)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=f"无法解析 M2：{exc}") from exc

    status = "available" if skin_files else "skin_missing"

    return {
        "model_folder": model_folder,
        "resource_type": resource_type,
        "status": status,
        "m2_files": [str(p.relative_to(settings.project_root)) for p in m2_files],
        "main_m2": str(main_m2.relative_to(settings.project_root)),
        "skin_files": [str(p.relative_to(settings.project_root)) for p in skin_files],
        "blp_files": [str(p.relative_to(settings.project_root)) for p in blp_files],
        "metadata": m2_metadata_to_dict(metadata),
    }


@router.get("/m2/{model_folder:path}/file/{relative_path:path}")
def stream_m2_file(model_folder: str, relative_path: str) -> FileResponse:
    """流式返回 .m2 或 .skin 原始字节，供前端解析器使用。"""
    source_path = _resolve_source_path(relative_path)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在：{relative_path}")

    suffix = source_path.suffix.lower()
    media_type = {
        ".m2": "application/octet-stream",
        ".skin": "application/octet-stream",
    }.get(suffix, "application/octet-stream")

    return FileResponse(source_path, media_type=media_type)
