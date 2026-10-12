"""来源资源标注服务（只读）。

从资源 YAML 的 dbc.* 子树派生 {(dbc_file, record_id) → [来源资源]} 映射，
供 DBC 查看器在记录行与详情上标注「该记录被哪些资源引用/写入」。

缓存以 registry.json 的 (mtime_ns, size) 为键——任何资源 CRUD 都会重新
生成 registry.json，因此 mtime 变化即映射失效的天然信号。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml

from app.core.config import settings

logger = logging.getLogger(__name__)

# (dbc 子树 section, 键) → DBC 文件名
# 前四项为补丁写入口径，后三项为官方数据引用口径（07 §十五 15.2）
_MAPPINGS: list[tuple[tuple[str, str], str]] = [
    (("creature_model_data", "id"), "CreatureModelData.dbc"),
    (("creature_display_info", "id"), "CreatureDisplayInfo.dbc"),
    (("spell", "id"), "Spell.dbc"),
    (("item", "id"), "Item.dbc"),
    (("item", "display_id"), "ItemDisplayInfo.dbc"),
    (("spell", "icon_id"), "SpellIcon.dbc"),
    (("spell", "visual_id"), "SpellVisual.dbc"),
]

AnnotationMap = dict[tuple[str, int], list[dict[str, Any]]]

_cache_key: tuple[int, int] | None = None
_annotation_map: AnnotationMap = {}


def _registry_cache_key() -> tuple[int, int]:
    """registry.json 的 (mtime_ns, size)；文件缺失返回 (0, 0)。"""
    try:
        stat = settings.registry_file.stat()
    except OSError:
        return (0, 0)
    return (stat.st_mtime_ns, stat.st_size)


def _build_map() -> AnnotationMap:
    """扫描全部资源 YAML，构建 (dbc_file, record_id) → 来源资源列表。"""
    result: AnnotationMap = {}
    for resource_type in ("mount", "pet", "npc"):
        plural = f"{resource_type}s"
        dir_path = settings.resources_dir / plural
        for path in sorted(dir_path.glob("*.yaml")):
            _accumulate_file(path, resource_type, result)
    return result


def _accumulate_file(path: Path, resource_type: str, result: AnnotationMap) -> None:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (yaml.YAMLError, OSError):
        logger.warning("来源标注跳过无法解析的 YAML：%s", path)
        return
    if not isinstance(data, dict):
        return

    dbc_tree = data.get("dbc")
    if not isinstance(dbc_tree, dict):
        return

    official_db = data.get("official_db")
    official_name = official_db.get("name") if isinstance(official_db, dict) else None
    summary = {
        "id": data.get("id"),
        "type": resource_type,
        "name": official_name or data.get("model_folder"),
        "model_folder": data.get("model_folder"),
    }

    for (section, key_name), dbc_file in _MAPPINGS:
        section_data = dbc_tree.get(section)
        if not isinstance(section_data, dict):
            continue
        value = section_data.get(key_name)
        if isinstance(value, int):
            result.setdefault((dbc_file, value), []).append(summary)


def get_annotation_map() -> AnnotationMap:
    """获取 (dbc_file, record_id) → 来源资源列表 的映射（registry mtime 缓存）。"""
    global _cache_key, _annotation_map
    key = _registry_cache_key()
    if _cache_key == key:
        return _annotation_map
    _annotation_map = _build_map()
    _cache_key = key
    logger.info("DBC 来源标注映射已构建：%d 条", len(_annotation_map))
    return _annotation_map


def get_annotations(dbc_file: str, record_ids: list[int]) -> list[dict[str, Any]]:
    """批量获取指定 DBC 文件中若干记录的来源标注（只含命中的记录）。"""
    annotation_map = get_annotation_map()
    return [
        {"record_id": record_id, "resources": annotation_map[(dbc_file, record_id)]}
        for record_id in record_ids
        if (dbc_file, record_id) in annotation_map
    ]


def get_record_annotation(dbc_file: str, record_id: int) -> list[dict[str, Any]]:
    """获取单条记录的来源资源列表。"""
    return get_annotation_map().get((dbc_file, record_id), [])
