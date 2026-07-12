"""缩略图缓存管理。

缓存路径规则：assets/thumbnails/{width}x{height}/{relative_path}.webp
命中条件：源文件 mtime 未变化。
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.preview.blp_decoder import decode_blp_to_webp

DEFAULT_THUMBNAIL_SIZE = (128, 128)


def _cache_key(size: tuple[int, int]) -> str:
    return f"{size[0]}x{size[1]}"


def get_thumbnail_path(source_path: Path, size: tuple[int, int] | None = None) -> Path:
    """根据源文件路径和目标尺寸计算缓存路径。

    Args:
        source_path: 原始资源文件路径（必须是 project_root 下的相对或绝对路径）。
        size: 目标尺寸，默认 128x128。

    Returns:
        缓存文件绝对路径。
    """
    if size is None:
        size = DEFAULT_THUMBNAIL_SIZE

    try:
        rel_path = source_path.relative_to(settings.project_root)
    except ValueError:
        if source_path.is_absolute():
            try:
                rel_path = source_path.resolve().relative_to(settings.project_root.resolve())
            except ValueError:
                rel_path = source_path
        else:
            resolved = (Path.cwd() / source_path).resolve()
            try:
                rel_path = resolved.relative_to(settings.project_root.resolve())
            except ValueError:
                rel_path = source_path

    return settings.thumbnails_dir / _cache_key(size) / f"{rel_path}.webp"


def is_cache_valid(cache_path: Path, source_path: Path) -> bool:
    """判断缓存是否仍然有效。

    Args:
        cache_path: 缓存文件路径。
        source_path: 源文件路径。

    Returns:
        缓存存在且 mtime 不早于源文件时返回 True。
    """
    if not cache_path.exists():
        return False
    if not source_path.exists():
        return False
    return cache_path.stat().st_mtime >= source_path.stat().st_mtime


def get_or_create_thumbnail(
    source_path: Path,
    size: tuple[int, int] | None = None,
    *,
    quality: int = 85,
) -> Path:
    """获取缩略图，缓存命中时直接返回，否则生成。

    Args:
        source_path: 原始 .blp 文件路径。
        size: 目标尺寸。
        quality: WebP 质量。

    Returns:
        缓存文件路径。
    """
    if size is None:
        size = DEFAULT_THUMBNAIL_SIZE

    cache_path = get_thumbnail_path(source_path, size)
    if is_cache_valid(cache_path, source_path):
        return cache_path

    return decode_blp_to_webp(
        source_path,
        cache_path,
        max_size=size,
        quality=quality,
    )


def clear_thumbnails(size: tuple[int, int] | None = None) -> int:
    """清理缩略图缓存。

    Args:
        size: 若指定只清理该尺寸；否则清理全部缩略图缓存。

    Returns:
        删除的文件数量。
    """
    count = 0
    if size is not None:
        target_dir = settings.thumbnails_dir / _cache_key(size)
        dirs = [target_dir] if target_dir.exists() else []
    else:
        dirs = (
            [p for p in settings.thumbnails_dir.iterdir() if p.is_dir()]
            if settings.thumbnails_dir.exists()
            else []
        )

    for directory in dirs:
        for file_path in directory.rglob("*.webp"):
            file_path.unlink()
            count += 1
        # 删除空目录
        for sub_dir in sorted(directory.rglob("*"), reverse=True):
            if sub_dir.is_dir() and not any(sub_dir.iterdir()):
                sub_dir.rmdir()
    return count


def cleanup_missing_sources(size: tuple[int, int] | None = None) -> int:
    """删除源文件已不存在的缩略图缓存。

    Args:
        size: 若指定只扫描该尺寸；否则扫描全部。

    Returns:
        删除的文件数量。
    """
    count = 0
    if size is not None:
        target_dir = settings.thumbnails_dir / _cache_key(size)
        dirs = [target_dir] if target_dir.exists() else []
    else:
        dirs = (
            [p for p in settings.thumbnails_dir.iterdir() if p.is_dir()]
            if settings.thumbnails_dir.exists()
            else []
        )

    for directory in dirs:
        for file_path in directory.rglob("*.webp"):
            # 缓存路径为 {rel_source_path}.webp，去掉 .webp 得到源相对路径
            rel_str = str(file_path.relative_to(directory))
            if rel_str.endswith(".webp"):
                rel_str = rel_str[:-5]
            source_path = settings.project_root / rel_str
            if not source_path.exists():
                file_path.unlink()
                count += 1
    return count
