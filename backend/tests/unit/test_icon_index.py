"""图标索引服务单元测试。"""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.preview.icon_index import ICON_BASE_DIR, ICON_INV_FILE, IconIndex, find_icon_path

# sources/ 原始图标库不入库，缺失时（如 CI）跳过依赖真实图标的用例
_requires_icon_source = pytest.mark.skipif(
    not (ICON_INV_FILE.exists() and (ICON_BASE_DIR / "inv_hippo_green.blp").exists()),
    reason=f"本地图标库不存在：{settings.sources_dir / 'icons'}",
)


@_requires_icon_source
def test_find_icon_path_existing() -> None:
    path = find_icon_path("inv_hippo_green")
    assert path is not None
    assert path.name == "inv_hippo_green.blp"
    assert path.exists()


def test_find_icon_path_missing() -> None:
    assert find_icon_path("nonexistent_icon_name_12345") is None


def test_find_icon_path_empty() -> None:
    assert find_icon_path("") is None
    assert find_icon_path(None) is None  # type: ignore[arg-type]


@_requires_icon_source
def test_icon_index_refresh() -> None:
    index = IconIndex()
    index.refresh()
    icons = index.all_icons()
    assert "inv_hippo_green" in icons
