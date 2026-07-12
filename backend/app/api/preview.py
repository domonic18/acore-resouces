"""预览服务 REST API 路由。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.core.config import settings
from app.preview.asset_resolver import resolve_resource_dir
from app.preview.converter_client import convert_m2_to_gltf
from app.preview.icon_index import find_icon_path
from app.preview.m2_reader import m2_metadata_to_dict, read_m2_metadata
from app.preview.thumbnail_cache import get_or_create_thumbnail

router = APIRouter(prefix="/api/preview", tags=["preview"])


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


@router.get("/model/{model_folder:path}")
def preview_model(
    model_folder: str,
    resource_type: str | None = Query(None, description="资源类型：mount/pet/npc"),
) -> dict[str, Any]:
    """获取 M2 模型元数据、贴图列表与转换状态。

    目前仅返回文件级元数据；glTF 转换状态由 model-converter PoC 完成后补充。
    """
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
            "metadata": None,
            "message": "未找到 .m2 文件",
        }

    # 优先使用主视图 .m2（通常不含 _lod、_saddle 等后缀）
    main_m2 = m2_files[0]
    for m2 in m2_files:
        base = m2.stem.lower()
        if "_lod" not in base and "_saddle" not in base and "mount" not in base:
            main_m2 = m2
            break
    else:
        # 若未找到理想主文件，选择最短的文件名
        main_m2 = min(m2_files, key=lambda p: len(p.name))

    try:
        metadata = read_m2_metadata(main_m2)
        status = "fallback" if metadata.partial else "metadata_only"
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=f"无法解析 M2：{exc}") from exc

    conversion = convert_m2_to_gltf(resource_type, model_folder)

    return {
        "model_folder": model_folder,
        "resource_type": resource_type,
        "status": status,
        "m2_files": [str(p.relative_to(settings.project_root)) for p in m2_files],
        "main_m2": str(main_m2.relative_to(settings.project_root)),
        "metadata": m2_metadata_to_dict(metadata),
        "conversion": conversion,
    }
