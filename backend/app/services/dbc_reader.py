"""通用 DBC 只读读取服务。

对 data/wow-dbc/src/dbc/ 下全部 DBC 文件提供通用只读访问：文件列表
（20 字节文件头轻读，不整页解析）、记录分页查询（单字段过滤）、单条
记录全字段详情。不提供任何写操作——DBC 修改一律经资源编辑与补丁
构建流程。

记录标识语义：schema 含名为 ID 的字段时用其值；否则回退 1-based 行号
（如 gtNPCManaCostScaler.dbc 等无 ID 首列的表）。
"""

from __future__ import annotations

import logging
import re
import struct
from collections import OrderedDict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from wow_dbc_tool import DBCFile, DBCRecord, FieldDef, SchemaRegistry
from wow_dbc_tool.core.exceptions import DBCError, DBCSchemaError

from app.core.config import settings
from app.services.path_display import display_path

logger = logging.getLogger(__name__)

WOW_DBC_DIR = settings.project_root / "data" / "wow-dbc" / "src" / "dbc"

FILE_NAME_RE = re.compile(r"^[A-Za-z0-9_]+\.dbc$")
VALID_OPS = ("eq", "contains", "gt", "lt")

# 进程内 LRU 缓存：(file, root) -> ((mtime_ns, size), DBCFile)。
# 解析结果较大（Spell.dbc 数万记录），限制缓存文件数避免内存失控。
_DBC_CACHE_LIMIT = 16
_dbc_cache: OrderedDict[tuple[str, str], tuple[tuple[int, int], DBCFile]] = OrderedDict()


class DbcFileNotFoundError(FileNotFoundError):
    """DBC 文件名不合法或文件不存在。"""


class DbcUnreadableError(ValueError):
    """DBC 文件无法解析（非 WDBC 格式或数据损坏）。"""


class DbcInvalidQueryError(ValueError):
    """查询参数非法（字段不存在、操作符不支持或值类型不匹配）。"""


def _resolve_path(file: str, base_dir: Path | None = None) -> Path:
    """校验文件名并解析为 DBC 目录（或 base_dir）下的绝对路径。"""
    if not FILE_NAME_RE.fullmatch(file):
        raise DbcFileNotFoundError(f"非法 DBC 文件名：{file!r}")
    path = (base_dir or WOW_DBC_DIR) / file
    if not path.is_file():
        raise DbcFileNotFoundError(f"DBC 文件不存在：{file}")
    return path


def _read_header(path: Path) -> dict[str, Any] | None:
    """轻量读取 20 字节文件头（不解析记录区）。"""
    try:
        with path.open("rb") as f:
            data = f.read(20)
    except OSError:
        return None
    if len(data) < 20:
        return None
    magic = data[:4].decode("ascii", errors="replace")
    record_count, field_count, record_size, string_block_size = struct.unpack("<4I", data[4:20])
    return {
        "magic": magic,
        "record_count": record_count,
        "field_count": field_count,
        "record_size": record_size,
        "string_block_size": string_block_size,
    }


def list_dbc_files() -> dict[str, Any]:
    """列出 DBC 目录下全部文件（名称、大小、记录数、schema 注册状态、文件头信息）。

    Returns:
        {"total": 文件数, "base_dir": 展示用目录路径, "items": [{"name", "size",
        "mtime", "record_count", "schema_registered", "header": {...} | None}]}，
        按名称排序。
    """
    registered = set(SchemaRegistry.list_all())
    items: list[dict[str, Any]] = []
    for path in sorted(WOW_DBC_DIR.glob("*.dbc")):
        stat = path.stat()
        header = _read_header(path)
        items.append(
            {
                "name": path.name,
                "size": stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                "record_count": header["record_count"] if header else None,
                "schema_registered": path.name in registered,
                "header": header,
            }
        )
    return {"total": len(items), "base_dir": display_path(WOW_DBC_DIR), "items": items}


def _load(file: str, base_dir: Path | None = None) -> DBCFile:
    """按文件名加载 DBCFile，(file, root, mtime_ns, size) 为键做 LRU 缓存。"""
    root = str(base_dir or WOW_DBC_DIR)
    path = _resolve_path(file, base_dir)
    stat = path.stat()
    stat_key = (stat.st_mtime_ns, stat.st_size)
    lru_key = (file, root)
    cached = _dbc_cache.get(lru_key)
    if cached is not None and cached[0] == stat_key:
        _dbc_cache.move_to_end(lru_key)
        return cached[1]
    try:
        dbc = DBCFile(path).load()
    except (DBCError, struct.error) as exc:
        raise DbcUnreadableError(f"无法解析 DBC 文件 {file}：{exc}") from exc
    _dbc_cache[lru_key] = (stat_key, dbc)
    while len(_dbc_cache) > _DBC_CACHE_LIMIT:
        _dbc_cache.popitem(last=False)
    logger.info("DBC 已加载：%s（%d 条记录，%d 字段）", file, len(dbc.records), len(dbc.schema))
    return dbc


def _has_id_field(dbc: DBCFile) -> bool:
    return any(f.name == "ID" for f in dbc.schema)


def _record_identifier(record: DBCRecord, has_id: bool, index_1based: int) -> int:
    """记录标识：有 ID 字段用其值，否则用 1-based 行号。"""
    if has_id:
        value = record.get("ID", None)
        if isinstance(value, int):
            return value
    return index_1based


def _field_value(record: DBCRecord, field: FieldDef) -> Any:
    """读取单个字段值，解析失败（截断等）返回 None。"""
    try:
        return record.get(field.name)
    except (DBCSchemaError, struct.error):
        return None


def _sanitize(value: Any) -> Any:
    """字符串中的不可打印字符转义为 \\xNN，其余类型原样返回。"""
    if isinstance(value, str):
        return "".join(
            ch if (ch.isprintable() or ch in "\n\r\t") else f"\\x{ord(ch):02x}" for ch in value
        )
    return value


def _coerce_value(field: FieldDef, value: str) -> int | float | str:
    """按字段类型转换过滤值，失败抛 DbcInvalidQueryError。"""
    try:
        if field.type in ("uint32", "int32"):
            return int(value)
        if field.type == "float":
            return float(value)
    except ValueError as exc:
        raise DbcInvalidQueryError(
            f"字段 {field.name!r}（{field.type}）不接受值 {value!r}"
        ) from exc
    return value


def query_records(
    file: str,
    *,
    page: int = 1,
    page_size: int = 20,
    field: str | None = None,
    op: str = "eq",
    value: str | None = None,
    base_dir: Path | None = None,
) -> dict[str, Any]:
    """分页查询 DBC 记录，可选单字段过滤（op ∈ eq/contains/gt/lt）。

    Args:
        file: DBC 文件名（如 "Spell.dbc"）。
        page: 页码（1-based）。
        page_size: 每页数量。
        field: 过滤字段名，None 表示不过滤。
        op: 过滤操作符。
        value: 过滤值（按字段类型转换）。
        base_dir: 文件所在目录，None 用默认 DBC 目录（MPQ 提取件复用）。

    Returns:
        {"total", "page", "page_size", "items": [{...字段值, "_record_id", "_index"}],
        "fields": [{"name", "type"}]}。

    Raises:
        DbcFileNotFoundError: 文件名不合法或不存在。
        DbcUnreadableError: 文件无法解析。
        DbcInvalidQueryError: 过滤字段/操作符/值非法。
    """
    dbc = _load(file, base_dir)
    all_records = dbc.all()
    index_of = {id(r): i for i, r in enumerate(all_records)}

    if field is not None:
        if value is None or value == "":
            raise DbcInvalidQueryError("指定过滤字段时 value 不能为空")
        if op not in VALID_OPS:
            raise DbcInvalidQueryError(f"不支持的操作符：{op!r}（可选 {'/'.join(VALID_OPS)}）")
        field_def = next((f for f in dbc.schema if f.name == field), None)
        if field_def is None:
            raise DbcInvalidQueryError(f"字段不存在：{field!r}")
        filter_key = field if op == "eq" else f"{field}__{op}"
        records = dbc.query(**{filter_key: _coerce_value(field_def, value)})
    else:
        records = all_records

    total = len(records)
    start = (page - 1) * page_size
    page_records = records[start : start + page_size]

    has_id = _has_id_field(dbc)
    items: list[dict[str, Any]] = []
    for record in page_records:
        item = {name: _sanitize(v) for name, v in record.to_dict().items()}
        item["_index"] = index_of[id(record)] + 1
        item["_record_id"] = _record_identifier(record, has_id, item["_index"])
        items.append(item)

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
        "fields": [{"name": f.name, "type": f.type} for f in dbc.schema],
    }


def get_record(file: str, record_id: int, *, base_dir: Path | None = None) -> dict[str, Any] | None:
    """查询单条记录全字段详情。

    有 ID 字段的表按 ID 值匹配；无 ID 字段的表按 1-based 行号取。

    Args:
        file: DBC 文件名。
        record_id: 记录 ID（或行号）。
        base_dir: 文件所在目录，None 用默认 DBC 目录（MPQ 提取件复用）。

    Returns:
        {"file", "record_id", "index", "fields": [{"name", "type", "value"}]}；
        未命中返回 None。

    Raises:
        DbcFileNotFoundError: 文件名不合法或不存在。
        DbcUnreadableError: 文件无法解析。
    """
    dbc = _load(file, base_dir)
    all_records = dbc.all()
    has_id = _has_id_field(dbc)

    record: DBCRecord | None = None
    index = -1
    if has_id:
        for i, r in enumerate(all_records):
            if r.get("ID", None) == record_id:
                record = r
                index = i
                break
    elif 1 <= record_id <= len(all_records):
        index = record_id - 1
        record = all_records[index]

    if record is None:
        return None

    fields = [
        {
            "name": f.name,
            "type": f.type,
            "value": _sanitize(_field_value(record, f)),
        }
        for f in dbc.schema
    ]
    return {
        "file": file,
        "record_id": record_id,
        "index": index + 1,
        "fields": fields,
    }
