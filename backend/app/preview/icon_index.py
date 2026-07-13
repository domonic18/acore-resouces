"""图标名称索引。

解析 sources/icons/interface/icon_inv.txt 与 icon_spell.txt，
建立图标名到 .blp 文件路径的反向索引。
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

ICON_BASE_DIR = settings.sources_dir / "icons" / "interface" / "icons"
ICON_INV_FILE = settings.sources_dir / "icons" / "interface" / "icon_inv.txt"
ICON_SPELL_FILE = settings.sources_dir / "icons" / "interface" / "icon_spell.txt"


class IconIndex:
    """图标名称到 .blp 路径的反向索引。"""

    def __init__(self) -> None:
        self._index: dict[str, Path] | None = None

    def _build(self) -> dict[str, Path]:
        index: dict[str, Path] = {}

        for txt_file in (ICON_INV_FILE, ICON_SPELL_FILE):
            if not txt_file.exists():
                continue
            try:
                with txt_file.open("r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        name = line.strip()
                        if not name:
                            continue
                        # icon_spell.txt 行格式为 INTERFACE\ICONS\name
                        if "\\" in name or "/" in name:
                            name = Path(name.replace("\\", "/")).name
                        index[name] = ICON_BASE_DIR / f"{name}.blp"
            except OSError:
                continue

        # 回退：扫描图标目录，确保即使 txt 索引缺失也能列出所有 .blp
        if ICON_BASE_DIR.exists():
            blp_files = list(ICON_BASE_DIR.glob("*.blp"))
            for blp_file in blp_files:
                name = blp_file.stem
                if name not in index:
                    index[name] = blp_file
        else:
            logger.warning("图标目录不存在: %s", ICON_BASE_DIR)

        logger.info(
            "图标索引构建完成: sources_dir=%s, icon_base_dir=%s, count=%d",
            settings.sources_dir,
            ICON_BASE_DIR,
            len(index),
        )
        return index

    def refresh(self) -> None:
        """强制刷新索引。"""
        self._index = self._build()

    def _get_index(self) -> dict[str, Path]:
        if self._index is None:
            self._index = self._build()
        return self._index

    def find(self, icon_name: str | None) -> Path | None:
        """根据图标名称查找 .blp 文件路径。

        Args:
            icon_name: 图标名称，如 inv_ardenwealdstagmount_blue。

        Returns:
            对应的 .blp 文件路径；若未找到则返回 None。
        """
        if not icon_name:
            return None

        index = self._get_index()
        path = index.get(icon_name)
        if path and path.exists():
            return path

        # 回退：直接拼接路径
        fallback = ICON_BASE_DIR / f"{icon_name}.blp"
        if fallback.exists():
            return fallback

        return None

    def all_icons(self) -> dict[str, Path]:
        """返回全部索引条目。"""
        return dict(self._get_index())


_icon_index: IconIndex | None = None


def get_icon_index() -> IconIndex:
    """获取全局图标索引实例。"""
    global _icon_index  # noqa: PLW0603
    if _icon_index is None:
        _icon_index = IconIndex()
    return _icon_index


def find_icon_path(icon_name: str | None) -> Path | None:
    """根据图标名查找 .blp 路径的便捷函数。"""
    return get_icon_index().find(icon_name)


def refresh_icon_index() -> dict[str, Path]:
    """刷新并返回全部图标索引。"""
    index = get_icon_index()
    index.refresh()
    return index.all_icons()
