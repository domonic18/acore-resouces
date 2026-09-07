"""MPQ 档案只读查看 REST API 路由。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services import dbc_reader, mpq_inspector

router = APIRouter(prefix="/api/mpq", tags=["mpq"])


@router.get("/archives")
def list_mpq_archives_endpoint() -> dict:
    """列出 workspace/mpq 与 workspace/dist 下全部 MPQ 档案（含混淆等级）。"""
    return mpq_inspector.list_archives()


@router.get("/files")
def list_mpq_files_endpoint(
    archive: str = Query(..., max_length=300, description="档案工作区相对路径"),
    prefix: str = Query("", max_length=500, description="档案内目录前缀"),
    search: str | None = Query(None, max_length=200, description="路径搜索词"),
) -> dict:
    """列出档案内容：prefix 一级子项（懒加载层级树）或 search 扁平匹配。"""
    try:
        return mpq_inspector.list_files(archive, prefix=prefix, search=search)
    except mpq_inspector.MpqArchiveNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except mpq_inspector.MpqInvalidPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except mpq_inspector.MpqInspectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/file")
def read_mpq_file_endpoint(
    archive: str = Query(..., max_length=300, description="档案工作区相对路径"),
    path: str = Query(..., max_length=500, description="档案内文件路径"),
) -> dict:
    """提取单个文件并按扩展名分发内容预览（text/blp/dbc/binary）。"""
    try:
        result = mpq_inspector.read_file_preview(archive, path)
    except mpq_inspector.MpqArchiveNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except mpq_inspector.MpqFileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except mpq_inspector.MpqInvalidPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except mpq_inspector.MpqInspectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    cache_path = result.get("cache_path")
    if cache_path:
        if result["kind"] == "blp":
            result["preview_url"] = f"/api/preview/blp/{cache_path}"
        elif result["kind"] == "binary":
            result["download_url"] = f"/api/preview/file/{cache_path}"
    return result


@router.get("/file/records")
def query_mpq_dbc_records_endpoint(
    archive: str = Query(..., max_length=300, description="档案工作区相对路径"),
    path: str = Query(..., max_length=500, description="档案内 DBC 文件路径"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    field: str | None = Query(None, max_length=100, description="过滤字段名"),
    op: str = Query("eq", description="过滤操作符：eq/contains/gt/lt"),
    value: str | None = Query(None, max_length=200, description="过滤值"),
) -> dict:
    """分页查询档案内 DBC 文件的记录（复用 dbc_reader，无来源标注）。"""
    try:
        target = mpq_inspector.extract_file(archive, path)
        return dbc_reader.query_records(
            target.name,
            page=page,
            page_size=page_size,
            field=field,
            op=op,
            value=value,
            base_dir=target.parent,
        )
    except mpq_inspector.MpqArchiveNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except mpq_inspector.MpqFileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except mpq_inspector.MpqInvalidPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except mpq_inspector.MpqInspectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except dbc_reader.DbcFileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except dbc_reader.DbcUnreadableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except dbc_reader.DbcInvalidQueryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/file/record")
def get_mpq_dbc_record_endpoint(
    archive: str = Query(..., max_length=300, description="档案工作区相对路径"),
    path: str = Query(..., max_length=500, description="档案内 DBC 文件路径"),
    record_id: int = Query(..., description="记录 ID（或行号）"),
) -> dict:
    """查询单条 DBC 记录全字段详情（复用 dbc_reader，无来源标注）。"""
    try:
        target = mpq_inspector.extract_file(archive, path)
        result = dbc_reader.get_record(target.name, record_id, base_dir=target.parent)
    except mpq_inspector.MpqArchiveNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except mpq_inspector.MpqFileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except mpq_inspector.MpqInvalidPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except mpq_inspector.MpqInspectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except dbc_reader.DbcFileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except dbc_reader.DbcUnreadableError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail=f"记录不存在：{path} #{record_id}")
    return result
