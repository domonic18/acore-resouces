"""图标索引服务单元测试。"""

from __future__ import annotations

from app.preview.icon_index import IconIndex, find_icon_path


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


def test_icon_index_refresh() -> None:
    index = IconIndex()
    index.refresh()
    icons = index.all_icons()
    assert "inv_hippo_green" in icons
