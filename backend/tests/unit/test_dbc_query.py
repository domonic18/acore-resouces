"""dbc_query 服务单元测试（依赖项目内真实 ItemDisplayInfo.dbc）。"""

from __future__ import annotations

import pytest

from app.services import dbc_query

_requires_dbc = pytest.mark.skipif(
    not dbc_query.ITEM_DISPLAY_INFO_PATH.exists(),
    reason="本地 ItemDisplayInfo.dbc 不存在",
)


@_requires_dbc
def test_load_index_nonempty() -> None:
    index = dbc_query._load_index()
    assert len(index) > 80000


@_requires_dbc
def test_get_exact_record() -> None:
    entry = dbc_query.get_item_display_info(95971)
    assert entry is not None
    assert entry.id == 95971
    assert entry.icon_name == "inv_belt_45"


@_requires_dbc
def test_get_missing_record_returns_none() -> None:
    assert dbc_query.get_item_display_info(99999999) is None


@_requires_dbc
def test_get_record_with_empty_icon() -> None:
    index = dbc_query._load_index()
    empty_icon_id = next(rid for rid, icon in index.items() if icon is None)
    entry = dbc_query.get_item_display_info(empty_icon_id)
    assert entry is not None
    assert entry.id == empty_icon_id
    assert entry.icon_name is None


@_requires_dbc
def test_search_numeric_exact_and_prefix() -> None:
    # 精确命中置顶
    items, total = dbc_query.search_item_display_info("95971", limit=10)
    assert total >= 1
    assert items[0].id == 95971
    assert items[0].icon_name == "inv_belt_45"
    # 前缀匹配：剩余结果也是 9597x 段
    assert all(str(item.id).startswith("9597") for item in items)
    assert items == sorted(items, key=lambda e: 0 if e.id == 95971 else e.id)


@_requires_dbc
def test_search_numeric_no_match() -> None:
    items, total = dbc_query.search_item_display_info("9999999", limit=10)
    assert items == []
    assert total == 0


@_requires_dbc
def test_search_name_substring_case_insensitive() -> None:
    items, total = dbc_query.search_item_display_info("ARDENWEALDSTAG", limit=200)
    assert total >= 1
    assert any(item.icon_name == "inv_ardenwealdstagmount_blue" for item in items)


@_requires_dbc
def test_search_empty_returns_all_sorted() -> None:
    items, total = dbc_query.search_item_display_info("", limit=20)
    # 全量 83830 条中约 1.5 万条图标名为空，不参与搜索
    assert total > 60000
    assert len(items) == 20
    ids = [item.id for item in items]
    assert ids == sorted(ids)
    # 空图标名记录不参与搜索结果
    assert all(item.icon_name for item in items)


@_requires_dbc
def test_search_pagination_total_stable() -> None:
    _, total_all = dbc_query.search_item_display_info("inv_misc", limit=10)
    items_first, _ = dbc_query.search_item_display_info("inv_misc", limit=10, offset=0)
    items_second, _ = dbc_query.search_item_display_info("inv_misc", limit=10, offset=10)
    assert len(items_first) == 10
    assert items_second[0].id not in {item.id for item in items_first}
    first_ids = [item.id for item in items_first]
    second_ids = [item.id for item in items_second]
    assert first_ids + second_ids == sorted(first_ids + second_ids)
    # total 不随 offset 变化
    _, total_again = dbc_query.search_item_display_info("inv_misc", limit=5, offset=5)
    assert total_again == total_all
