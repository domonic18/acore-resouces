"""DBC 计划汇总、冲突检查与源 DBC 编辑。

包加载时通过 `_load_wow_dbc_schemas()` 从项目本地 tools/wow-dbc-tool/schemas/
注册 DBC 字段定义（wow-dbc-tool 作为 uv 路径依赖安装时可能无法自动定位
schema 目录）。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

from wow_dbc_tool import DBCFile
from wow_dbc_tool.core.dbc_record import DBCRecord
from wow_dbc_tool.schema.registry import SchemaRegistry

import app.services.mount_patch_builder as _facade
from app.core.config import settings
from app.schemas.patch import DBCPlan

from ._context import JobContext
from ._errors import MountPatchBuilderError


def _load_wow_dbc_schemas() -> None:
    """从项目本地 tools/wow-dbc-tool/schemas/ 加载 DBC 字段定义。

    wow-dbc-tool 作为 uv 路径依赖安装时，可能无法自动定位 schema 目录，
    因此手动注册项目内的 schema 文件。
    """
    schemas_dir = settings.project_root / "tools" / "wow-dbc-tool" / "schemas"
    if not schemas_dir.exists():
        return
    for schema_path in schemas_dir.glob("*.schema.json"):
        try:
            SchemaRegistry.load_from_file(schema_path)
        except (json.JSONDecodeError, OSError):
            continue


_load_wow_dbc_schemas()


def _normalize_field_value(key: str, value: Any) -> str:
    """规范化字段值用于幂等比较，路径字段统一分隔符与大小写。"""
    text = str(value) if value is not None else ""
    if key.lower() == "modelname":
        text = text.replace("\\", "/").lower()
    return text


def _fields_match(existing: DBCRecord | dict[str, Any], planned: dict[str, Any]) -> bool:
    """判断现有记录中的字段是否与计划字段一致（忽略大小写、路径分隔符）。"""
    if isinstance(existing, DBCRecord):
        existing = existing.to_dict()
    for key, planned_value in planned.items():
        if key not in existing:
            return False
        if _normalize_field_value(key, existing[key]) != _normalize_field_value(key, planned_value):
            return False
    return True


def collect_dbc_operations(
    contexts: list[JobContext],
) -> dict[str, list[tuple[JobContext, dict[str, Any]]]]:
    """汇总所有任务按 DBC 文件分组的操作。

    ModelName 等字段直接采用 YAML 真相源中的显式值——主模型的选择是
    人工调试/前端预览后确定并固定在资源 YAML 中的，代码不做推导。

    Returns:
        {dbc_file: [(context, operation), ...]}
    """
    grouped: dict[str, list[tuple[JobContext, dict[str, Any]]]] = {}
    for ctx in contexts:
        for plan_file in ctx.dbc_plan.plans:
            dbc_file = plan_file.dbc_file
            grouped.setdefault(dbc_file, [])
            for op in plan_file.operations:
                grouped[dbc_file].append((ctx, op.model_dump()))
    return grouped


def check_conflicts(
    grouped_ops: dict[str, list[tuple[JobContext, dict[str, Any]]]],
    rebuild_jobs: set[str],
) -> dict[str, list[tuple[str, int]]]:
    """检查 DBC 记录 ID 冲突。

    由于源 DBC 已包含目标记录时我们不会覆盖，仅将同一批次内重复出现的
    record_id 视为冲突。

    Args:
        grouped_ops: 按 DBC 文件分组的操作。
        rebuild_jobs: 需要重建的任务 ID 集合（当前未使用，保留兼容）。

    Returns:
        {job_id: [(dbc_file, record_id), ...]}
    """
    conflicts: dict[str, list[tuple[str, int]]] = {}
    seen: dict[str, set[int]] = {}
    for dbc_file, operations in grouped_ops.items():
        seen.setdefault(dbc_file, set())
        for ctx, op in operations:
            if op.get("action", "add") != "add":
                continue
            record_id = int(op["record_id"])
            if record_id in seen[dbc_file]:
                conflicts.setdefault(ctx.job_id, []).append((dbc_file, record_id))
            seen[dbc_file].add(record_id)
    return conflicts


def apply_dbc_operations(
    grouped_ops: dict[str, list[tuple[JobContext, dict[str, Any]]]],
    dry_run: bool = False,
    force: bool = False,
) -> list[dict[str, Any]]:
    """应用 DBC 操作并捕获字段级 before 值供审计。

    源 DBC 中已存在的记录默认跳过，避免覆盖历史数据；仅新增缺失记录。
    force=True 时已存在记录按计划字段强制重写（edit），用于全量重建。

    Returns:
        审计记录列表：{dbc_file, record_id, job_id, action, action_taken,
        before(计划字段的旧值子集，新增记录为 None), after(计划字段值)}。
    """
    audit_records: list[dict[str, Any]] = []
    for dbc_file, operations in grouped_ops.items():
        dbc_path = _facade.WOW_DBC_DIR / dbc_file
        dbc = DBCFile(dbc_path)
        dbc.load()

        for ctx, op in operations:
            action = op.get("action", "add")
            fields = op.get("fields", {})
            record_id = int(op["record_id"])
            # 既有调用方（单测）允许 ctx 为 None
            job_id = ctx.job_id if ctx is not None else None

            existing = dbc.get(ID=record_id)
            # to_dict() 每次新建 dict，edit 前捕获即为旧值
            before_dict = existing.to_dict() if existing is not None else None
            if before_dict is None:
                before = None
            else:
                before = {k: before_dict[k] for k in fields if k in before_dict}
            action_taken = "skipped_existing"
            if action == "add":
                if existing is None:
                    action_taken = "added"
                    if not dry_run:
                        dbc.add(**fields)
                elif force:
                    action_taken = "edited"
                    if not dry_run:
                        dbc.edit(existing, **fields)
                # 否则已存在则跳过，不执行 edit
            elif action == "edit":
                if existing is not None:
                    action_taken = "edited"
                    if not dry_run:
                        dbc.edit(existing, **fields)
            else:
                raise MountPatchBuilderError(f"不支持的 DBC 操作: {action}")

            audit_records.append(
                {
                    "dbc_file": dbc_file,
                    "record_id": record_id,
                    "job_id": job_id,
                    "action": action,
                    "action_taken": action_taken,
                    "before": before,
                    "after": fields,
                }
            )

        if not dry_run:
            dbc.save(dbc_path)
    return audit_records


def _record_by_id(dbc_path: Path, record_id: int | None) -> dict[str, Any] | None:
    """按 ID 查询 DBC 记录。"""
    if record_id is None or not dbc_path.exists():
        return None
    dbc = DBCFile(dbc_path)
    dbc.load()
    record = dbc.get(ID=record_id)
    return cast(dict[str, Any], record) if record is not None else None


def load_dbc_record_ids(dbc_path: Path) -> set[int]:
    """加载 DBC 文件中全部记录的 ID。

    用于批量判断「某条记录是否已被占用」——加载一次即可复用，
    避免为每个坐骑重复读取整个 DBC 文件。

    Args:
        dbc_path: DBC 文件路径。

    Returns:
        该文件中已存在的记录 ID 集合；文件不存在时返回空集。
    """
    if not dbc_path.exists():
        return set()
    dbc = DBCFile(dbc_path)
    dbc.load()
    return {int(record.get("ID")) for record in dbc.records if record.get("ID")}


def find_existing_dbc_records(
    dbc_plan: DBCPlan,
    id_cache: dict[str, set[int]] | None = None,
) -> list[dict[str, Any]]:
    """检查计划中每条 DBC 记录是否已存在于源 DBC。

    构建时已存在的记录会被跳过而不覆盖，预检阶段提前暴露这一点。

    Args:
        dbc_plan: 待检查的 DBC 修改计划。
        id_cache: 跨计划复用的「文件名 → 已占用 ID 集合」缓存；
            批量预检时传入可避免重复加载 DBC。

    Returns:
        每条记录的占用情况，形如
        ``{"dbc_file": "Spell.dbc", "record_id": 80003, "exists": True}``。
    """
    result: list[dict[str, Any]] = []
    cache = id_cache if id_cache is not None else {}
    for plan_file in dbc_plan.plans:
        if plan_file.dbc_file not in cache:
            cache[plan_file.dbc_file] = load_dbc_record_ids(
                _facade.WOW_DBC_DIR / plan_file.dbc_file
            )
        occupied = cache[plan_file.dbc_file]
        for op in plan_file.operations:
            result.append(
                {
                    "dbc_file": plan_file.dbc_file,
                    "record_id": op.record_id,
                    "exists": op.record_id in occupied,
                }
            )
    return result
