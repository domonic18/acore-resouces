"""坐骑 SQL 文件生成。

按现场构建的 SQL 计划，为每只坐骑在 mounts/{id:04d}_{slug}/ 子目录下
生成 add / loot 两个 SQL 文件，并保持与历史 SQL 的幂等。
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import app.services.mount_patch_builder as _facade

from ._context import JobContext, sanitize_model_folder
from ._logging import _log


def _sql_value(value: Any) -> str:
    """将 Python 值转为 SQL 字面量。"""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def _collect_existing_sql_entries() -> set[int]:
    """扫描已有的 SQL 文件，收集其中 item_template 的 entry 值。

    用于判断某个坐骑的 SQL 是否已经生成过，避免重复追加。
    递归扫描 SQL_LINK_DIR，覆盖根目录的历史批次文件与 mounts/ 子目录。
    """
    entries: set[int] = set()
    sql_link_dir = _facade.SQL_LINK_DIR
    if not sql_link_dir.exists():
        return entries

    pattern = re.compile(
        r"INSERT INTO\s+`item_template`\s+\([^)]*\)\s*VALUES\s*\((\d+)", re.IGNORECASE
    )
    for sql_file in sql_link_dir.rglob("*.sql"):
        try:
            text = sql_file.read_text(encoding="utf-8")
        except OSError:
            continue
        for match in pattern.finditer(text):
            try:
                entries.add(int(match.group(1)))
            except ValueError:
                continue
    return entries


def _job_item_entry(ctx: JobContext) -> int | None:
    """从现场构建的 SQL 计划中提取该坐骑 item_template 的 entry。"""
    for table in ctx.sql_plan.tables:
        if table.name == "item_template" and table.records:
            return int(table.records[0].get("entry") or 0) or None
    return None


def generate_sql(ctx: JobContext, dry_run: bool = False, force: bool = False) -> list[Path]:
    """为单个坐骑生成 SQL 文件，写入 mounts/{id:04d}_{slug}/ 子目录。

    生成的文件：
    - {id:04d}_mount_add.sql：creature_model_info / creature_template / item_template
    - {id:04d}_mount_loot.sql：creature_loot_template（仅当 DropInfo.entry 存在）

    Args:
        ctx: 任务上下文（含现场构建的 SQL 计划）。
        dry_run: 为 True 时只返回预期路径，不写入文件。
        force: 为 True 时跳过幂等检查，即使 item_template entry 已存在于历史 SQL 也强制生成。
            用于迁移场景（把历史 batch 中的坐骑搬到新结构）。默认 False 保留幂等行为。

    Returns:
        生成的 SQL 文件路径列表；若该坐骑 SQL 已存在且 force=False 则返回空列表。
    """
    _facade.ensure_sql_symlink()

    existing_entries = set() if force else _collect_existing_sql_entries()

    resource = ctx.resource
    mount_id = int(resource.id or 0)
    if mount_id <= 0:
        _log(f"  跳过：资源缺少合法 ID ({ctx.job_id})")
        return []

    slug = sanitize_model_folder(str(resource.model_folder or ctx.job_id))
    mount_dir = _facade.SQL_MOUNTS_DIR / f"{mount_id:04d}_{slug}"
    mount_name = resource.official_db.name or ctx.job_id

    item_entry = _job_item_entry(ctx)
    if item_entry is not None and item_entry in existing_entries:
        _log(f"  跳过已有 SQL 的坐骑: {mount_name} (item_template entry={item_entry})")
        return []

    add_tables: list[dict[str, Any]] = []
    loot_tables: list[dict[str, Any]] = []
    for table in ctx.sql_plan.tables:
        table_dict = table.model_dump()
        if table.name in ("creature_loot_template", "gameobject_loot_template"):
            loot_tables.append(table_dict)
        else:
            add_tables.append(table_dict)

    add_file = mount_dir / f"{mount_id:04d}_mount_add.sql"
    loot_file = mount_dir / f"{mount_id:04d}_mount_loot.sql" if loot_tables else None

    if dry_run:
        expected: list[Path] = [add_file]
        if loot_file is not None:
            expected.append(loot_file)
        return expected

    mount_dir.mkdir(parents=True, exist_ok=True)
    now_iso = datetime.now(UTC).strftime("%Y-%m-%d")

    add_content = _build_sql_file_content(
        title=f"自定义坐骑：{mount_name}",
        mount_id=mount_id,
        job_id=ctx.job_id,
        date_iso=now_iso,
        tables=add_tables,
    )
    add_file.write_text(add_content, encoding="utf-8")
    written: list[Path] = [add_file]

    if loot_file is not None:
        loot_content = _build_sql_file_content(
            title=f"坐骑掉落：{mount_name}",
            mount_id=mount_id,
            job_id=ctx.job_id,
            date_iso=now_iso,
            tables=loot_tables,
        )
        loot_file.write_text(loot_content, encoding="utf-8")
        written.append(loot_file)

    return written


def _build_sql_file_content(
    title: str,
    mount_id: int,
    job_id: str,
    date_iso: str,
    tables: list[dict[str, Any]],
) -> str:
    """构造单个 SQL 文件的内容。"""
    lines = [
        "-- ============================================================",
        f"-- mod-custom-content: {title}",
        f"-- Mount ID: {mount_id:04d}",
        f"-- Job: {job_id}",
        f"-- Date: {date_iso}",
        "-- Author: acore-resouces build-mount-patch",
        "-- Database: db-world",
        "-- ============================================================",
        "",
    ]

    for table in tables:
        table_name = table["name"]
        for record in table.get("records", []):
            where_clause = _build_delete_where_clause(table_name, record)
            if where_clause is not None:
                lines.append(f"DELETE FROM `{table_name}` WHERE {where_clause};")
            columns = ", ".join(f"`{k}`" for k in record.keys())
            values = ", ".join(_sql_value(v) for v in record.values())
            lines.append(f"INSERT INTO `{table_name}` ({columns})")
            lines.append(f"VALUES ({values});")
            lines.append("")

    return "\n".join(lines)


def _build_delete_where_clause(table_name: str, record: dict[str, Any]) -> str | None:
    """根据表名构造 DELETE WHERE 子句；不支持主键推断时返回 None。"""
    if table_name in ("creature_loot_template", "gameobject_loot_template"):
        entry = record.get("Entry")
        item = record.get("Item")
        if entry is None or item is None:
            return None
        return f"`Entry` = {_sql_value(entry)} AND `Item` = {_sql_value(item)}"

    if table_name == "creature_template_model":
        creature_id = record.get("CreatureID")
        idx = record.get("Idx")
        if creature_id is None or idx is None:
            return None
        return f"`CreatureID` = {_sql_value(creature_id)} AND `Idx` = {_sql_value(idx)}"

    if table_name == "npc_spellclick_spells":
        npc_entry = record.get("npc_entry")
        spell_id = record.get("spell_id")
        if npc_entry is None or spell_id is None:
            return None
        return f"`npc_entry` = {_sql_value(npc_entry)} AND `spell_id` = {_sql_value(spell_id)}"

    # AC 主键为 (entry, seat_id)
    if table_name == "vehicle_template_accessory":
        entry = record.get("entry")
        seat_id = record.get("seat_id")
        if entry is None or seat_id is None:
            return None
        return f"`entry` = {_sql_value(entry)} AND `seat_id` = {_sql_value(seat_id)}"

    pk_column = _primary_key_column(table_name)
    pk_value = record.get(pk_column)
    if pk_value is None:
        return None
    return f"`{pk_column}` = {_sql_value(pk_value)}"


def _primary_key_column(table_name: str) -> str:
    """根据表名推断主键列名。"""
    mapping = {
        "creature_model_info": "DisplayID",
        "creature_template": "entry",
        "item_template": "entry",
    }
    return mapping.get(table_name, "ID")
