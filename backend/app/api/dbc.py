"""DBC 只读查询 REST API 路由。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.dbc import ItemDisplayInfoEntry, ItemDisplayInfoPage
from app.services import dbc_query

router = APIRouter(prefix="/api/dbc", tags=["dbc"])


@router.get("/item-display-info")
def search_item_display_info_endpoint(
    search: str = Query(
        "", max_length=100, description="搜索词：纯数字按 ID 匹配，否则按图标名匹配"
    ),
    limit: int = Query(60, ge=1, le=200, description="每页数量"),
    offset: int = Query(0, ge=0, description="偏移量"),
) -> ItemDisplayInfoPage:
    """分页搜索 ItemDisplayInfo.dbc 记录（供 Display ID 选择器使用）。"""
    items, total = dbc_query.search_item_display_info(search, limit=limit, offset=offset)
    return ItemDisplayInfoPage(items=items, total=total)


@router.get("/item-display-info/{record_id}")
def get_item_display_info_endpoint(record_id: int) -> ItemDisplayInfoEntry:
    """按 ID 精确查询单条 ItemDisplayInfo 记录。"""
    entry = dbc_query.get_item_display_info(record_id)
    if entry is None:
        raise HTTPException(
            status_code=404,
            detail=f"ItemDisplayInfo 记录不存在：{record_id}",
        )
    return entry
