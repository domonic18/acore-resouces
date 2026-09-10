"""DBC 只读查询 REST API 路由。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.dbc import ItemDisplayInfoEntry, ItemDisplayInfoPage
from app.services import dbc_annotation, dbc_query, dbc_reader
from app.services.resource_store import list_resources

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


@router.get("/files")
def list_dbc_files_endpoint() -> dict:
    """列出全部 DBC 文件（名称、大小、记录数、schema 注册状态、文件头信息）。"""
    try:
        return dbc_reader.list_dbc_files()
    except OSError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{file}/next-free-id")
def next_free_id_endpoint(
    file: str,
    start: int = Query(90000, ge=1, description="起始 ID（含）"),
) -> dict:
    """探测指定 DBC 文件从 start 起的第一个空闲 ID。

    除 DBC 已占用 ID 外，还合并所有坐骑 YAML 已声明的自建 vehicle_id，
    避免并发选号时与尚未写回 DBC 的占用撞号。
    """
    reserved: set[int] = set()
    if file.removesuffix(".dbc") == "Vehicle":
        for mount in list_resources("mount"):
            if mount.resource_type == "mount" and mount.vehicle is not None:
                reserved.add(mount.vehicle.vehicle_id)
    try:
        free_id = dbc_query.next_free_id(file, start, reserved=reserved)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"file": file, "start": start, "next_free_id": free_id}


@router.get("/{file}/records")
def query_dbc_records_endpoint(
    file: str,
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    field: str | None = Query(None, max_length=100, description="过滤字段名"),
    op: str = Query("eq", description="过滤操作符：eq/contains/gt/lt"),
    value: str | None = Query(None, max_length=200, description="过滤值"),
) -> dict:
    """分页查询指定 DBC 文件的记录（可选单字段过滤），附字段元数据与来源资源标注。"""
    try:
        result = dbc_reader.query_records(
            file, page=page, page_size=page_size, field=field, op=op, value=value
        )
    except dbc_reader.DbcFileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except dbc_reader.DbcUnreadableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except dbc_reader.DbcInvalidQueryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    record_ids = [item["_record_id"] for item in result["items"]]
    result["annotations"] = dbc_annotation.get_annotations(file, record_ids)
    return result


@router.get("/{file}/records/{record_id}")
def get_dbc_record_endpoint(file: str, record_id: int) -> dict:
    """查询单条 DBC 记录的全字段详情（名称/类型/值 + 来源资源标注）。"""
    try:
        result = dbc_reader.get_record(file, record_id)
    except dbc_reader.DbcFileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except dbc_reader.DbcUnreadableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail=f"记录不存在：{file} #{record_id}")

    result["resources"] = dbc_annotation.get_record_annotation(file, record_id)
    return result
