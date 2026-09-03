"""坐骑补丁构建服务。

负责读取 workspace/patch-jobs/ 下的任务，按 job.json 中的资源 ID 现场
读取 data/resources/ 真相源 YAML，在内存中构建 DBC/SQL 计划后批量编辑
源 DBC、生成 SQL、构建 MPQ、输出校验报告并更新任务状态。

该服务被 backend/app/cli/patch.py 的 `patch build` 命令调用。
底层依赖：
- wow-dbc-tool（Python API / CLI）用于 DBC 读写。
- tools/wow-mpq-cli/build/bin/mpqcli 用于 MPQ 打包。
"""

from __future__ import annotations

import dataclasses
import json
import re
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import yaml
from wow_dbc_tool import DBCFile
from wow_dbc_tool.core.dbc_record import DBCRecord
from wow_dbc_tool.schema.registry import SchemaRegistry

from app.core.config import settings
from app.schemas.patch import DBCPlan, SQLPlan
from app.schemas.resource import Mount

WOW_DBC_DIR = settings.project_root / "data" / "wow-dbc" / "src" / "dbc"
MPQCLI = settings.project_root / "tools" / "wow-mpq-cli" / "build" / "bin" / "mpqcli"
MPQ_OUTPUT_DIR = settings.project_root / "workspace" / "mpq"
REPORTS_DIR = settings.project_root / "workspace" / "reports"
SQL_LINK_DIR = settings.project_root / "data" / "sql" / "azerothcore-updates"
SQL_MOUNTS_DIR = SQL_LINK_DIR / settings.acore_sql_mounts_subdir

REQUIRED_DBC_FILES = [
    "CreatureModelData.dbc",
    "CreatureDisplayInfo.dbc",
    "Spell.dbc",
    "Item.dbc",
]

_MODEL_LOD_SUFFIXES = ("_low.m2", "_high.m2", "_lod.m2")


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


@dataclasses.dataclass
class ValidationResult:
    """单个校验项结果。"""

    name: str
    passed: bool
    expected: Any | None = None
    actual: Any | None = None
    message: str = ""
    severity: str = "error"  # error 或 warning


@dataclasses.dataclass
class JobValidation:
    """单个任务的校验汇总。"""

    job_id: str
    mount_name: str
    passed: bool
    checks: list[ValidationResult]


class MountPatchBuilderError(Exception):
    """坐骑补丁构建过程中的通用错误。"""


class DBCConflictError(MountPatchBuilderError):
    """检测到 DBC 记录 ID 冲突。"""


@dataclasses.dataclass
class JobContext:
    """单个补丁任务的运行时上下文。

    资源与计划均在构建开始时从真相源现场读取/生成，
    任务目录中不落盘任何快照（dry-run 计划除外）。
    """

    job_dir: Path
    job_id: str
    manifest: dict[str, Any]
    resource: Mount
    dbc_plan: DBCPlan
    sql_plan: SQLPlan
    assets: dict[str, Any]


def build_job_context(job_dir: Path) -> JobContext:
    """从任务目录现场构建 JobContext。

    按 job.json 中的资源 ID 从 data/resources/ 读取最新 YAML，
    并现场生成 DBC/SQL 计划与资源清单。

    Raises:
        MountPatchBuilderError: job.json 缺失、损坏或资源 YAML 不存在。
    """
    job_json = job_dir / "job.json"
    if not job_json.exists():
        raise MountPatchBuilderError(f"任务缺少 job.json: {job_dir}")
    try:
        manifest = load_json(job_json)
    except json.JSONDecodeError as exc:
        raise MountPatchBuilderError(f"job.json 损坏: {job_json}") from exc

    job_id = str(manifest.get("job_id") or job_dir.name)
    resource_type = str(manifest.get("resource_type") or "mount")
    resource_id = int(manifest.get("resource_id") or 0)

    from app.services.patch_exporter import build_assets_json, build_dbc_plan, build_sql_plan
    from app.services.resource_store import load_resource

    resource = load_resource(resource_type, resource_id)
    if resource is None:
        raise MountPatchBuilderError(
            f"{job_id} 引用的资源已不存在: {resource_type} ID={resource_id}"
        )
    if resource.resource_type != resource_type:
        raise MountPatchBuilderError(
            f"{job_id} 资源类型不匹配: 期望 {resource_type}，实际 {resource.resource_type}"
        )

    return JobContext(
        job_dir=job_dir,
        job_id=job_id,
        manifest=manifest,
        resource=cast(Mount, resource),
        dbc_plan=build_dbc_plan(cast(Mount, resource)),
        sql_plan=build_sql_plan(cast(Mount, resource)),
        assets=build_assets_json(resource),
    )


def load_yaml(path: Path) -> dict[str, Any]:
    """读取 YAML 文件。"""
    with path.open("r", encoding="utf-8") as f:
        return cast(dict[str, Any], yaml.safe_load(f) or {})


def load_json(path: Path) -> dict[str, Any]:
    """读取 JSON 文件。"""
    with path.open("r", encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


def save_json(path: Path, data: dict[str, Any]) -> None:
    """写入 JSON 文件。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def ensure_sql_symlink() -> None:
    """确保指向 AzerothCore updates 目录的软链接存在。"""
    SQL_LINK_DIR.parent.mkdir(parents=True, exist_ok=True)
    if SQL_LINK_DIR.exists() or SQL_LINK_DIR.is_symlink():
        return

    real_dir = settings.acore_sql_updates_dir
    if real_dir is None:
        raise FileNotFoundError(
            "未配置 AzerothCore updates 目录。请在 .env 中设置 acore_sql_updates_dir "
            "或 ACORE_SQL_UPDATES_DIR 环境变量。"
        )
    if not real_dir.exists():
        raise FileNotFoundError(f"AzerothCore updates 目录不存在: {real_dir}")

    SQL_LINK_DIR.symlink_to(real_dir, target_is_directory=True)
    print(f"创建软链接: {SQL_LINK_DIR} -> {real_dir}")


def sanitize_model_folder(name: str) -> str:
    """清理模型目录名：仅保留 ASCII，去除空格、中文及其他特殊字符。

    Args:
        name: 原始模型目录名，可能包含中文或空格。

    Returns:
        清理后的全英文目录名。
    """
    ascii_only = re.sub(r"[^\x00-\x7F]", "", name)
    no_spaces = ascii_only.replace(" ", "")
    cleaned = re.sub(r"_+", "_", no_spaces.strip("_"))
    return cleaned or "model"


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


def is_lod_model(file_name: str) -> bool:
    """判断文件名是否为 LOD 变体模型。"""
    lower = file_name.lower()
    return any(lower.endswith(suffix) for suffix in _MODEL_LOD_SUFFIXES)


def resolve_main_model(m2_files: list[dict[str, Any]], folder_name: str = "") -> str | None:
    """从 M2 文件列表中挑选主模型文件。

    优先选择非 LOD 变体；若存在与模型目录同名的主文件则优先匹配。

    Args:
        m2_files: assets.json 中的 m2_files 列表。
        folder_name: 清理后的模型目录名，用于优先匹配主模型。

    Returns:
        主模型文件名，若无可用的则返回 None。
    """
    names = [str(f["name"]) for f in m2_files if f.get("name")]
    if not names:
        return None

    non_lod = [n for n in names if not is_lod_model(n)]
    candidates = non_lod if non_lod else names

    folder_stem = Path(folder_name).stem.lower()
    for n in candidates:
        if Path(n).stem.lower() == folder_stem:
            return n

    candidates.sort(key=lambda n: len(n), reverse=True)
    return candidates[0]


def find_jobs(
    patch_jobs_dir: Path,
    all_requested: bool,
    job_ids: list[str] | None,
) -> tuple[list[JobContext], set[str]]:
    """查找要处理的任务，并现场构建各任务的 JobContext。

    Args:
        patch_jobs_dir: 补丁任务根目录。
        all_requested: 是否处理所有可处理状态的任务。
        job_ids: 指定的任务 ID 列表。

    Returns:
        (任务上下文列表, 需要重建的任务 ID 集合)

    Raises:
        MountPatchBuilderError: 未指定任务且未使用 --all-requested，或没有可处理的任务。
    """
    if job_ids:
        dirs = [patch_jobs_dir / jid for jid in job_ids]
    elif all_requested:
        if not patch_jobs_dir.exists():
            raise MountPatchBuilderError(f"补丁任务目录不存在: {patch_jobs_dir}")
        dirs = sorted(patch_jobs_dir.iterdir())
    else:
        raise MountPatchBuilderError("请指定 --jobs 或 --all-requested")

    contexts: list[JobContext] = []
    rebuild: set[str] = set()
    for d in dirs:
        job_json = d / "job.json"
        if not job_json.exists():
            continue
        data = load_json(job_json)
        status = data.get("status")
        if status not in ("requested", "generated", "failed"):
            continue
        if status == "generated":
            rebuild.add(d.name)
        try:
            contexts.append(build_job_context(d))
        except MountPatchBuilderError as exc:
            print(f"  警告：跳过任务 {d.name}: {exc}")

    if not contexts:
        raise MountPatchBuilderError("没有可处理的任务。")
    return contexts, rebuild


def _model_name_field(
    assets: dict[str, Any],
    dbc_file: str,
    op_fields: dict[str, Any],
) -> dict[str, Any]:
    """如果操作是 CreatureModelData，根据实际资源文件计算 ModelName。

    以 assets 中的实际 m2 文件为准，保证 DBC 中的模型路径与 MPQ 内
    文件路径一致。
    """
    if dbc_file != "CreatureModelData.dbc":
        return op_fields

    raw_folder = assets.get("model_folder") or ""
    folder = sanitize_model_folder(raw_folder)
    main_model = resolve_main_model(assets.get("m2_files", []), folder)
    if not main_model:
        return op_fields

    fields = dict(op_fields)
    fields["ModelName"] = f"creature\\{folder}\\{main_model}"
    return fields


def collect_dbc_operations(
    contexts: list[JobContext],
) -> dict[str, list[tuple[JobContext, dict[str, Any]]]]:
    """汇总所有任务按 DBC 文件分组的操作。

    Returns:
        {dbc_file: [(context, operation), ...]}
    """
    grouped: dict[str, list[tuple[JobContext, dict[str, Any]]]] = {}
    for ctx in contexts:
        for plan_file in ctx.dbc_plan.plans:
            dbc_file = plan_file.dbc_file
            grouped.setdefault(dbc_file, [])
            for op in plan_file.operations:
                enriched_op = op.model_dump()
                enriched_op["fields"] = _model_name_field(
                    ctx.assets,
                    dbc_file,
                    op.fields,
                )
                grouped[dbc_file].append((ctx, enriched_op))
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
) -> None:
    """应用 DBC 操作。

    源 DBC 中已存在的记录默认跳过，避免覆盖历史数据；仅新增缺失记录。
    force=True 时已存在记录按计划字段强制重写（edit），用于全量重建。
    """
    for dbc_file, operations in grouped_ops.items():
        dbc_path = WOW_DBC_DIR / dbc_file
        dbc = DBCFile(dbc_path)
        dbc.load()

        for _ctx, op in operations:
            action = op.get("action", "add")
            fields = op.get("fields", {})
            record_id = int(op["record_id"])

            existing = dbc.get(ID=record_id)
            if action == "add":
                if existing is None:
                    if not dry_run:
                        dbc.add(**fields)
                elif force and not dry_run:
                    dbc.edit(existing, **fields)
                # 否则已存在则跳过，不执行 edit
            elif action == "edit":
                if existing is not None and not dry_run:
                    dbc.edit(existing, **fields)
            else:
                raise MountPatchBuilderError(f"不支持的 DBC 操作: {action}")

        if not dry_run:
            dbc.save(dbc_path)


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
    if not SQL_LINK_DIR.exists():
        return entries

    pattern = re.compile(
        r"INSERT INTO\s+`item_template`\s+\([^)]*\)\s*VALUES\s*\((\d+)", re.IGNORECASE
    )
    for sql_file in SQL_LINK_DIR.rglob("*.sql"):
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
    ensure_sql_symlink()

    existing_entries = set() if force else _collect_existing_sql_entries()

    resource = ctx.resource
    mount_id = int(resource.id or 0)
    if mount_id <= 0:
        print(f"  跳过：资源缺少合法 ID ({ctx.job_id})")
        return []

    slug = sanitize_model_folder(str(resource.model_folder or ctx.job_id))
    mount_dir = SQL_MOUNTS_DIR / f"{mount_id:04d}_{slug}"
    mount_name = resource.official_db.name or ctx.job_id

    item_entry = _job_item_entry(ctx)
    if item_entry is not None and item_entry in existing_entries:
        print(f"  跳过已有 SQL 的坐骑: {mount_name} (item_template entry={item_entry})")
        return []

    add_tables: list[dict[str, Any]] = []
    loot_tables: list[dict[str, Any]] = []
    for table in ctx.sql_plan.tables:
        table_dict = table.model_dump()
        if table.name == "creature_loot_template":
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
    if table_name == "creature_loot_template":
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


_GAME_ASSET_EXTENSIONS = {".m2", ".blp", ".anim", ".skin", ".phys"}
_NON_GAME_ASSET_EXTENSIONS = {".png", ".gif", ".jpg", ".jpeg", ".txt", ".md", ".ini"}


def _copy_assets_to_staging(assets: dict[str, Any], staging: Path) -> list[Path]:
    """将任务的客户端资源按原始目录结构复制到 MPQ staging，返回写入的相对路径列表。"""
    written: list[Path] = []

    source_dir = settings.project_root / (assets.get("source_dir") or "")
    if source_dir.exists():
        creature_root = staging / "creature"
        creature_root.mkdir(parents=True, exist_ok=True)
        for src in sorted(source_dir.rglob("*")):
            if not src.is_file():
                continue
            ext = src.suffix.lower()
            if ext in _NON_GAME_ASSET_EXTENSIONS or ext not in _GAME_ASSET_EXTENSIONS:
                continue
            rel = src.relative_to(source_dir)
            dst = creature_root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            written.append(Path("creature") / rel)

    icon_root = staging / "Interface" / "icons"
    icon_root.mkdir(parents=True, exist_ok=True)
    copied_icons: set[Path] = set()
    for icon in assets.get("icon_files", []):
        rel_path = icon.get("relative_path")
        if not rel_path:
            continue
        src = settings.project_root / rel_path
        if not src.exists() or src in copied_icons:
            continue
        dst = icon_root / src.name
        shutil.copy2(src, dst)
        copied_icons.add(src)
        written.append(Path("Interface") / "icons" / src.name)

    return written


def build_mpq(
    contexts: list[JobContext],
    sql_files: list[Path],
    dry_run: bool = False,
) -> tuple[Path, dict[str, list[Path]]]:
    """构建批次 MPQ。

    Args:
        contexts: 要处理的任务上下文列表。
        sql_files: 已生成的 SQL 文件路径列表（可能为空，表示所有坐骑 SQL 均已存在）。
        dry_run: 为 True 时只返回路径，不创建文件。

    Returns:
        (mpq_path, {job_id: [相对路径列表]})
    """
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    mpq_dir = MPQ_OUTPUT_DIR / timestamp
    mpq_path = mpq_dir / "patch-mounts.mpq"
    staging = mpq_dir / "staging"

    if dry_run:
        return mpq_path, {}

    mpq_dir.mkdir(parents=True, exist_ok=True)

    dbc_staging = staging / "DBFilesClient"
    dbc_staging.mkdir(parents=True, exist_ok=True)
    for dbc_name in REQUIRED_DBC_FILES:
        src = WOW_DBC_DIR / dbc_name
        if src.exists():
            shutil.copy2(src, dbc_staging / dbc_name)

    job_assets: dict[str, list[Path]] = {}
    for ctx in contexts:
        job_assets[ctx.job_id] = _copy_assets_to_staging(ctx.assets, staging)

    subprocess.run(
        [str(MPQCLI), "create", str(staging), "--output", str(mpq_path), "--game", "wow-wotlk"],
        check=True,
    )
    shutil.rmtree(staging, ignore_errors=True)

    readme = mpq_dir / "readme.txt"
    mount_names = ", ".join(ctx.resource.official_db.name or ctx.job_id for ctx in contexts)
    sql_section = "\n".join(f"SQL: {f}" for f in sql_files) or "SQL: (无新增)"
    readme.write_text(
        f"Patch: patch-mounts.mpq\n"
        f"Generated: {datetime.now(UTC).isoformat()}\n"
        f"{sql_section}\n"
        f"Jobs: {', '.join(ctx.job_id for ctx in contexts)}\n"
        f"Mounts: {mount_names}\n",
        encoding="utf-8",
    )

    return mpq_path, job_assets


def update_job_records(
    contexts: list[JobContext],
    sql_files: list[Path],
    mpq_path: Path,
    report_path: Path,
    dry_run: bool = False,
) -> None:
    """更新各任务 job.json 为 generated 状态。"""
    now = datetime.now(UTC).isoformat()
    relative_sql_files = [str(f.relative_to(settings.project_root)) for f in sql_files]
    for ctx in contexts:
        manifest = ctx.manifest
        manifest["status"] = "generated"
        manifest["updated_at"] = now
        manifest["completed_at"] = now
        manifest["summary"] = f"处理 {len(contexts)} 个坐骑"
        artifacts = manifest.get("artifacts") or {}
        artifacts["output"] = {
            "dbc_dir": "data/wow-dbc/src/dbc",
            "sql_files": relative_sql_files,
            "mpq": str(mpq_path.relative_to(settings.project_root)),
            "validation_report": str(report_path.relative_to(settings.project_root)),
        }
        manifest["artifacts"] = artifacts
        if not dry_run:
            save_json(ctx.job_dir / "job.json", manifest)


def _record_by_id(dbc_path: Path, record_id: int | None) -> dict[str, Any] | None:
    """按 ID 查询 DBC 记录。"""
    if record_id is None or not dbc_path.exists():
        return None
    dbc = DBCFile(dbc_path)
    dbc.load()
    record = dbc.get(ID=record_id)
    return cast(dict[str, Any], record) if record is not None else None


def _find_sql_record(sql_plan: dict[str, Any], table_name: str) -> dict[str, Any] | None:
    """在 sql-plan 中查找指定表的第一条记录。"""
    for table in sql_plan.get("tables", []):
        if table.get("name") == table_name and table.get("records"):
            return cast(dict[str, Any], table["records"][0])
    return None


def _is_ascii_path(path: str) -> bool:
    """检查路径是否全为 ASCII 且不含空格。"""
    if not path:
        return True
    if " " in path:
        return False
    try:
        path.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


def _normalize_path(path: str) -> str:
    """统一路径分隔符为正斜杠并转小写，用于比较。"""
    return path.replace("\\", "/").lower()


def validate_job(ctx: JobContext, mpq_assets: list[Path]) -> JobValidation:
    """对单个任务执行一致性校验，返回校验结果。"""
    resource = ctx.resource
    sql_plan = ctx.sql_plan.model_dump()
    assets = ctx.assets
    mount_name = resource.official_db.name or ctx.job_id

    spell_id = resource.dbc.spell.id
    cmd_id = resource.dbc.creature_model_data.id
    cdi_id = resource.dbc.creature_display_info.id
    visual_id = resource.dbc.spell.visual_id

    ct_entry = resource.db.creature_template.entry
    it_record = _find_sql_record(sql_plan, "item_template") or {}
    it_spellid_2 = it_record.get("spellid_2")
    # AzerothCore 的 creature_template 已无 modelid1 列，显示模型关联由
    # creature_template_model 表（CreatureID ↔ CreatureDisplayID）承担。
    ctm_record = _find_sql_record(sql_plan, "creature_template_model") or {}
    ctm_creature_id = ctm_record.get("CreatureID")
    ctm_display_id = ctm_record.get("CreatureDisplayID")
    cmi_record = _find_sql_record(sql_plan, "creature_model_info") or {}
    cmi_display_id_sql = cmi_record.get("DisplayID") or cmi_record.get("display_id")

    checks: list[ValidationResult] = []

    checks.append(
        ValidationResult(
            name="spell_id_matches_item_template_spellid_2",
            passed=spell_id == it_spellid_2,
            expected=spell_id,
            actual=it_spellid_2,
            message="法术 ID 必须与 item_template.spellid_2 一致",
        )
    )

    cmd_record = _record_by_id(WOW_DBC_DIR / "CreatureModelData.dbc", cmd_id)
    cdi_record = _record_by_id(WOW_DBC_DIR / "CreatureDisplayInfo.dbc", cdi_id)
    cdi_model_id = cdi_record.get("ModelID") if cdi_record else None
    checks.append(
        ValidationResult(
            name="creature_model_data_id_matches_display_info_model_id",
            passed=cmd_id is not None and cmd_id == cdi_model_id,
            expected=cmd_id,
            actual=cdi_model_id,
            message="CreatureModelData.ID 必须与 CreatureDisplayInfo.ModelID 一致",
        )
    )

    checks.append(
        ValidationResult(
            name="creature_display_info_id_matches_creature_template_model",
            passed=(
                cdi_id is not None
                and ctm_display_id == cdi_id
                and (ct_entry is None or ctm_creature_id == ct_entry)
            ),
            expected={"CreatureID": ct_entry, "CreatureDisplayID": cdi_id},
            actual={"CreatureID": ctm_creature_id, "CreatureDisplayID": ctm_display_id},
            message=(
                "creature_template_model.CreatureDisplayID 必须与 CreatureDisplayInfo.ID 一致，"
                "CreatureID 必须与 creature_template.entry 一致"
            ),
        )
    )
    checks.append(
        ValidationResult(
            name="creature_display_info_id_matches_creature_model_info_display_id",
            passed=cdi_id is not None and cdi_id == cmi_display_id_sql,
            expected=cdi_id,
            actual=cmi_display_id_sql,
            message="CreatureDisplayInfo.ID 必须与 creature_model_info.display_id 一致",
        )
    )

    checks.append(
        ValidationResult(
            name="creature_template_entry_matches_spell_visual_id",
            passed=ct_entry is not None and ct_entry == visual_id,
            expected=visual_id,
            actual=ct_entry,
            message="creature_template.entry 必须与 spell.visual_id 一致",
        )
    )

    model_name_in_dbc = cmd_record.get("ModelName") if cmd_record else None
    mpq_asset_strs = [str(p) for p in mpq_assets]
    normalized_dbc_path = _normalize_path(model_name_in_dbc or "")

    path_matches = bool(normalized_dbc_path) and any(
        _normalize_path(p) == normalized_dbc_path for p in mpq_asset_strs
    )
    checks.append(
        ValidationResult(
            name="creature_model_data_path_matches_mpq",
            passed=path_matches,
            expected=mpq_asset_strs,
            actual=model_name_in_dbc,
            message="CreatureModelData.dbc 中的模型路径必须与 MPQ 中的实际文件路径一致",
        )
    )

    path_ascii_ok = _is_ascii_path(model_name_in_dbc or "")
    checks.append(
        ValidationResult(
            name="creature_model_data_path_ascii_only",
            passed=path_ascii_ok,
            expected="ASCII 且无空格",
            actual=model_name_in_dbc,
            message="CreatureModelData.dbc 中的模型路径必须全英文、无空格、无中文",
        )
    )

    all_mpq_ascii = all(_is_ascii_path(str(p)) for p in mpq_assets)
    checks.append(
        ValidationResult(
            name="mpq_model_paths_ascii_only",
            passed=all_mpq_ascii,
            expected="所有路径均为 ASCII 且无空格",
            actual=[str(p) for p in mpq_assets if not _is_ascii_path(str(p))],
            message="MPQ 中的模型文件路径包含非 ASCII 或空格；历史补丁中可能存在此类文件",
            severity="warning",
        )
    )

    raw_folder = assets.get("model_folder") or ""
    sanitized = sanitize_model_folder(raw_folder)
    checks.append(
        ValidationResult(
            name="model_folder_sanitized_no_chinese_or_spaces",
            passed=raw_folder == sanitized,
            expected=sanitized,
            actual=raw_folder,
            message="model_folder 清理后不应改变，说明原始值包含中文或空格；脚本已自动清理输出路径",
            severity="warning",
        )
    )

    passed = all(c.passed or c.severity == "warning" for c in checks)
    return JobValidation(
        job_id=ctx.job_id,
        mount_name=mount_name,
        passed=passed,
        checks=checks,
    )


def write_validation_report(
    contexts: list[JobContext],
    job_assets: dict[str, list[Path]],
    timestamp: str,
    dry_run: bool = False,
) -> Path:
    """生成并写入校验报告。"""
    report_dir = REPORTS_DIR / timestamp
    report_path = report_dir / "validation-report.json"
    if dry_run:
        return report_path

    report_dir.mkdir(parents=True, exist_ok=True)
    results: list[JobValidation] = []
    for ctx in contexts:
        assets = job_assets.get(ctx.job_id, [])
        results.append(validate_job(ctx, assets))

    data = {
        "generated_at": datetime.now(UTC).isoformat(),
        "batch_size": len(contexts),
        "job_ids": [ctx.job_id for ctx in contexts],
        "all_passed": all(r.passed for r in results),
        "jobs": [
            {
                "job_id": r.job_id,
                "mount_name": r.mount_name,
                "passed": r.passed,
                "checks": [
                    {
                        "name": c.name,
                        "passed": c.passed,
                        "severity": c.severity,
                        "expected": c.expected,
                        "actual": c.actual,
                        "message": c.message,
                    }
                    for c in r.checks
                ],
            }
            for r in results
        ],
    }
    save_json(report_path, data)
    return report_path


def _dump_plans(contexts: list[JobContext]) -> None:
    """把现场构建的计划写入各任务的 plans/ 目录，供 dry-run 审查。"""
    for ctx in contexts:
        plans_dir = ctx.job_dir / "plans"
        plans_dir.mkdir(parents=True, exist_ok=True)
        _write_yaml(
            plans_dir / "dbc-plan.yaml",
            ctx.dbc_plan.model_dump(exclude_none=False),
        )
        _write_yaml(
            plans_dir / "sql-plan.yaml",
            ctx.sql_plan.model_dump(exclude_none=False),
        )
        _write_json(plans_dir / "assets.json", ctx.assets)


def _clear_plans(contexts: list[JobContext]) -> None:
    """清理任务目录中遗留的 plans/（正式 build 前调用）。"""
    for ctx in contexts:
        shutil.rmtree(ctx.job_dir / "plans", ignore_errors=True)


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    """写入 YAML 文件。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)


def _write_json(path: Path, data: dict[str, Any]) -> None:
    """写入 JSON 文件。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def build_mount_patches(
    all_requested: bool = False,
    job_ids: list[str] | None = None,
    dry_run: bool = False,
    force: bool = False,
) -> dict[str, Any]:
    """批量构建坐骑补丁的入口函数。

    Args:
        all_requested: 处理所有可处理状态的任务。
        job_ids: 指定任务 ID 列表。
        dry_run: 为 True 时只做校验并把计划写入任务目录 plans/，不修改任何源文件。
        force: 为 True 时已存在的 DBC 记录按计划强制重写，SQL 跳过历史条目检查，用于全量重建。

    Returns:
        包含 jobs, sql_files, mpq_path, report_path 的字典。

    Raises:
        DBCConflictError: 检测到 DBC ID 冲突。
        MountPatchBuilderError: 其他构建错误。
    """
    contexts, rebuild_jobs = find_jobs(settings.patch_jobs_dir, all_requested, job_ids)

    print(f"将处理 {len(contexts)} 个任务：")
    for ctx in contexts:
        marker = "（重建）" if ctx.job_id in rebuild_jobs else ""
        print(f"  - {ctx.job_id}{marker}")
    print()

    grouped_ops = collect_dbc_operations(contexts)

    print("检查 DBC ID 冲突...")
    conflicts = check_conflicts(grouped_ops, rebuild_jobs)
    if conflicts:
        print("发现 ID 冲突：")
        for job_id, items in conflicts.items():
            details = ", ".join(f"{dbc}#{rid}" for dbc, rid in items)
            print(f"  {job_id}: {details}")
        raise DBCConflictError("存在 DBC ID 冲突，停止构建。")
    print("无冲突。\n")

    if dry_run:
        _dump_plans(contexts)
        print(f"审查计划已写入各任务目录 plans/ 子目录（共 {len(contexts)} 个任务）。")
        print("确认无误后，去掉 --dry-run 正式执行。\n")
    else:
        _clear_plans(contexts)

    print("应用 DBC 操作（直接编辑源 DBC）...")
    apply_dbc_operations(grouped_ops, dry_run=dry_run, force=force)

    print("生成坐骑 SQL（每只坐骑独立目录）...")
    sql_files: list[Path] = []
    for ctx in contexts:
        written = generate_sql(ctx, dry_run=dry_run, force=force)
        for f in written:
            print(f"  {f}")
            sql_files.append(f)
    if not sql_files:
        print("  无新增 SQL（所有坐骑均已存在 SQL 文件）。")
    print()

    print("构建 MPQ...")
    mpq_path, job_assets = build_mpq(contexts, sql_files, dry_run=dry_run)
    print(f"  {mpq_path}\n")

    timestamp = mpq_path.parent.name
    print("生成校验报告...")
    report_path = write_validation_report(contexts, job_assets, timestamp, dry_run=dry_run)
    print(f"  {report_path}\n")

    print("更新任务状态...")
    update_job_records(contexts, sql_files, mpq_path, report_path, dry_run=dry_run)

    if dry_run:
        print("干跑完成，未修改任何源文件。")
    else:
        print("完成。请手动提交 data/wow-dbc 子模块的 DBC 改动。")
        print(f"校验报告：{report_path}")

    return {
        "jobs": [ctx.job_id for ctx in contexts],
        "sql_files": [str(f) for f in sql_files],
        "mpq_path": str(mpq_path),
        "report_path": str(report_path),
        "dry_run": dry_run,
    }
