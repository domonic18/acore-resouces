"""DBC 只读查询服务。

提供 ItemDisplayInfo.dbc 记录的搜索与单条查询，供前端 Display ID
选择器展示「显示 ID → InventoryIcon 图标名」映射；以及任意 DBC 文件的
空闲 ID 探测（供自建 Vehicle.dbc 记录选号）。只读，不写回 DBC。
"""

from __future__ import annotations

import logging
from pathlib import Path

from wow_dbc_tool import DBCFile, FieldDef

from app.core.config import settings
from app.schemas.dbc import ItemDisplayInfoEntry

logger = logging.getLogger(__name__)

WOW_DBC_DIR = settings.project_root / "data" / "wow-dbc" / "src" / "dbc"
ITEM_DISPLAY_INFO_PATH = WOW_DBC_DIR / "ItemDisplayInfo.dbc"

# 仅读取选择器需要的两个字段：ID（col0）、InventoryIcon（col5，字符串）
_ITEM_DISPLAY_INFO_FIELDS = [
    FieldDef("ID", "uint32", 0),
    FieldDef("InventoryIcon", "string", 20),
]

# 进程内缓存：key 为文件 (mtime_ns, size)，wow-dbc submodule 更新后自动重载
_cache: dict[tuple[int, int], dict[int, str | None]] = {}


def _load_index() -> dict[int, str | None]:
    """惰性加载 ItemDisplayInfo.dbc 为 {id: icon_name} 索引。

    图标名为空字符串的记录统一存为 None。

    Returns:
        记录 ID → 图标名 的索引字典。

    Raises:
        FileNotFoundError: DBC 文件缺失。
    """
    try:
        stat = ITEM_DISPLAY_INFO_PATH.stat()
    except OSError as exc:
        raise FileNotFoundError(f"未找到 DBC 文件：{ITEM_DISPLAY_INFO_PATH}") from exc

    cache_key = (stat.st_mtime_ns, stat.st_size)
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    dbc = DBCFile(ITEM_DISPLAY_INFO_PATH, _ITEM_DISPLAY_INFO_FIELDS).load()
    index: dict[int, str | None] = {}
    for record in dbc.all():
        icon = record.get("InventoryIcon")
        record_id = record.get("ID")
        index[int(record_id)] = icon if icon else None

    _cache.clear()
    _cache[cache_key] = index
    logger.info("ItemDisplayInfo.dbc 已加载：%d 条记录", len(index))
    return index


def search_item_display_info(
    search: str = "",
    *,
    limit: int = 60,
    offset: int = 0,
) -> tuple[list[ItemDisplayInfoEntry], int]:
    """搜索 ItemDisplayInfo 记录。

    搜索规则：纯数字 → ID 精确命中置顶 + ID 前缀匹配；
    其他 → 图标名子串匹配（忽略大小写）。
    图标名为空的记录不参与搜索。

    Args:
        search: 搜索词，空字符串返回全部记录（ID 升序）。
        limit: 返回条数上限。
        offset: 跳过条数。

    Returns:
        (当前页记录（ID 升序，精确命中置顶）, 匹配总数)
    """
    index = _load_index()
    keyword = search.strip()
    candidates: list[tuple[int, str]]

    if not keyword:
        candidates = sorted((record_id, icon) for record_id, icon in index.items() if icon)
    elif keyword.isdigit():
        exact_id = int(keyword)
        candidates = sorted(
            (record_id, icon)
            for record_id, icon in index.items()
            if icon and (record_id == exact_id or str(record_id).startswith(keyword))
        )
        # 精确命中置顶（稳定排序，其余保持 ID 升序）
        candidates.sort(key=lambda pair: pair[0] != exact_id)
    else:
        needle = keyword.lower()
        candidates = sorted(
            (record_id, icon)
            for record_id, icon in index.items()
            if icon and needle in icon.lower()
        )

    total = len(candidates)
    page = candidates[offset : offset + limit]
    items = [ItemDisplayInfoEntry(id=record_id, icon_name=icon) for record_id, icon in page]
    return items, total


def get_item_display_info(record_id: int) -> ItemDisplayInfoEntry | None:
    """按记录 ID 精确查询单条 ItemDisplayInfo 记录。

    Args:
        record_id: ItemDisplayInfo.dbc 记录 ID。

    Returns:
        命中的记录；不存在返回 None。
    """
    index = _load_index()
    if record_id not in index:
        return None
    return ItemDisplayInfoEntry(id=record_id, icon_name=index[record_id])


def _load_id_set(path: Path) -> set[int]:
    """仅加载 DBC 文件的 ID 列，返回全部记录 ID 集合。"""
    dbc = DBCFile(path, [FieldDef("ID", "uint32", 0)]).load()
    return {int(record.get("ID")) for record in dbc.all()}


def next_free_id(
    file: str,
    start: int,
    *,
    reserved: set[int] | None = None,
) -> int:
    """从 start 起探测指定 DBC 文件中第一个未被占用的 ID。

    DBC 已占用 ID 与 reserved（如其他资源 YAML 已声明的自建 ID）合并后取最小空闲值。

    Args:
        file: DBC 文件名，如 ``Vehicle.dbc``（也可省略 .dbc 后缀）。
        start: 起始 ID（含）。
        reserved: DBC 之外额外占用的 ID 集合。

    Returns:
        最小空闲 ID。

    Raises:
        FileNotFoundError: DBC 文件缺失。
    """
    filename = file if file.endswith(".dbc") else f"{file}.dbc"
    path = WOW_DBC_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"未找到 DBC 文件：{path}")

    used = _load_id_set(path) | (reserved or set())
    candidate = start
    while candidate in used:
        candidate += 1
    return candidate
