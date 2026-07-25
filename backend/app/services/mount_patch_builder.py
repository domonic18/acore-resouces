"""坐骑补丁构建服务。

负责读取 workspace/patch-jobs/ 下的任务，批量编辑源 DBC、生成 SQL、
构建 MPQ、输出校验报告并更新任务 manifest。

该服务被 backend/app/cli/patch.py 的 `patch build` 命令调用。
底层依赖：
- wow-dbc-tool（Python API / CLI）用于 DBC 读写。
- tools/wow-mpq-cli/build/bin/mpqcli 用于 MPQ 打包。
"""

from __future__ import annotations

import dataclasses
import json
import os
import re
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import yaml
from wow_dbc_tool import DBCFile

from app.core.config import settings

WOW_DBC_DIR = settings.project_root / "data" / "wow-dbc" / "src" / "dbc"
MPQCLI = settings.project_root / "tools" / "wow-mpq-cli" / "build" / "bin" / "mpqcli"
MPQ_OUTPUT_DIR = settings.project_root / "workspace" / "mpq"
REPORTS_DIR = settings.project_root / "workspace" / "reports"
SQL_LINK_DIR = settings.project_root / "data" / "sql" / "azerothcore-updates"
DEFAULT_ACORE_UPDATES_REAL = Path(
    "/Users/deadwalk/Code/azerothcore-wotlk/modules/mod-custom-content/data/sql/db-world/updates"
)

REQUIRED_DBC_FILES = [
    "CreatureModelData.dbc",
    "CreatureDisplayInfo.dbc",
    "Spell.dbc",
    "Item.dbc",
]

_MODEL_LOD_SUFFIXES = ("_low.m2", "_high.m2", "_lod.m2")


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

    real_dir = Path(os.environ.get("ACORE_SQL_UPDATES_DIR", DEFAULT_ACORE_UPDATES_REAL))
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
) -> tuple[list[Path], set[str]]:
    """查找要处理的任务目录，并识别需要重建（已生成过）的任务。

    Args:
        patch_jobs_dir: 补丁任务根目录。
        all_requested: 是否处理所有可处理状态的任务。
        job_ids: 指定的任务 ID 列表。

    Returns:
        (任务目录列表, 需要重建的任务目录名集合)

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

    jobs: list[Path] = []
    rebuild: set[str] = set()
    for d in dirs:
        manifest = d / "manifest.json"
        if not manifest.exists():
            continue
        data = load_json(manifest)
        if data.get("status") in ("requested", "generated", "failed"):
            jobs.append(d)
            if data.get("status") == "generated":
                rebuild.add(d.name)

    if not jobs:
        raise MountPatchBuilderError("没有可处理的任务。")
    return jobs, rebuild


def _model_name_field(
    job_dir: Path,
    dbc_file: str,
    op_fields: dict[str, Any],
) -> dict[str, Any]:
    """如果操作是 CreatureModelData 且未指定 ModelName，自动计算并注入。"""
    if dbc_file != "CreatureModelData.dbc":
        return op_fields

    fields = dict(op_fields)
    if fields.get("ModelName"):
        return fields

    assets = load_json(job_dir / "input" / "assets.json")
    raw_folder = assets.get("model_folder") or ""
    folder = sanitize_model_folder(raw_folder)
    main_model = resolve_main_model(assets.get("m2_files", []), folder)
    if main_model:
        fields["ModelName"] = f"Creature\\{folder}\\{main_model}"
    else:
        fields["ModelName"] = ""
    return fields


def collect_dbc_operations(
    jobs: list[Path],
) -> dict[str, list[tuple[Path, dict[str, Any]]]]:
    """汇总所有任务按 DBC 文件分组的操作。

    Returns:
        {dbc_file: [(job_dir, operation), ...]}
    """
    grouped: dict[str, list[tuple[Path, dict[str, Any]]]] = {}
    for job_dir in jobs:
        dbc_plan = load_yaml(job_dir / "input" / "dbc-plan.yaml")
        for plan_file in dbc_plan.get("plans", []):
            dbc_file = plan_file["dbc_file"]
            grouped.setdefault(dbc_file, [])
            for op in plan_file.get("operations", []):
                enriched_op = dict(op)
                enriched_op["fields"] = _model_name_field(
                    job_dir,
                    dbc_file,
                    op.get("fields", {}),
                )
                grouped[dbc_file].append((job_dir, enriched_op))
    return grouped


def check_conflicts(
    grouped_ops: dict[str, list[tuple[Path, dict[str, Any]]]],
    rebuild_jobs: set[str],
) -> dict[str, list[tuple[str, int]]]:
    """检查 DBC 记录 ID 冲突。

    需要重建的任务中已存在的记录不视为冲突。

    Args:
        grouped_ops: 按 DBC 文件分组的操作。
        rebuild_jobs: 需要重建的任务目录名集合。

    Returns:
        {job_name: [(dbc_file, record_id), ...]}
    """
    conflicts: dict[str, list[tuple[str, int]]] = {}
    for dbc_file, operations in grouped_ops.items():
        dbc_path = WOW_DBC_DIR / dbc_file
        if not dbc_path.exists():
            continue
        dbc = DBCFile(dbc_path)
        dbc.load()
        for job_dir, op in operations:
            record_id = int(op["record_id"])
            is_rebuild = job_dir.name in rebuild_jobs
            if (
                op.get("action", "add") == "add"
                and dbc.get(ID=record_id) is not None
                and not is_rebuild
            ):
                conflicts.setdefault(job_dir.name, []).append((dbc_file, record_id))
    return conflicts


def apply_dbc_operations(
    grouped_ops: dict[str, list[tuple[Path, dict[str, Any]]]],
    dry_run: bool = False,
) -> None:
    """应用 DBC 操作。"""
    for dbc_file, operations in grouped_ops.items():
        dbc_path = WOW_DBC_DIR / dbc_file
        dbc = DBCFile(dbc_path)
        dbc.load()

        for _job_dir, op in operations:
            action = op.get("action", "add")
            fields = op.get("fields", {})
            record_id = int(op["record_id"])

            existing = dbc.get(ID=record_id)
            if action == "add":
                if existing is None and not dry_run:
                    dbc.add(**fields)
                elif existing is not None and not dry_run:
                    dbc.edit(existing, **fields)
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


def generate_sql(jobs: list[Path], dry_run: bool = False) -> Path:
    """生成批次 SQL 文件。

    Args:
        jobs: 要处理的任务目录列表。
        dry_run: 为 True 时只返回路径，不写入文件。

    Returns:
        SQL 文件路径。
    """
    ensure_sql_symlink()

    today = datetime.now(UTC).strftime("%Y_%m_%d")
    existing = sorted(SQL_LINK_DIR.glob(f"{today}_*_mcc_custom_mounts.sql"))
    seq = len(existing) + 1
    sql_file = SQL_LINK_DIR / f"{today}_{seq:02d}_mcc_custom_mounts.sql"

    now_iso = datetime.now(UTC).strftime("%Y-%m-%d")
    job_names = ", ".join(d.name for d in jobs)
    mount_names = ", ".join(
        load_yaml(d / "input" / "resource.yaml").get("official_db", {}).get("name", d.name)
        for d in jobs
    )

    lines = [
        "-- ============================================================",
        "-- mod-custom-content: 自定义坐骑批次补丁",
        f"-- Date: {now_iso}",
        "-- Author: acore-resouces build-mount-patch",
        f"-- Jobs: {job_names}",
        f"-- Mounts: {mount_names}",
        "-- Database: db-world",
        "-- ============================================================",
        "",
    ]

    for job_dir in jobs:
        resource = load_yaml(job_dir / "input" / "resource.yaml")
        sql_plan = load_yaml(job_dir / "input" / "sql-plan.yaml")
        mount_name = resource.get("official_db", {}).get("name", job_dir.name)

        lines.append("-- --------------------------------------------------------")
        lines.append(f"-- Mount: {mount_name}")
        lines.append(f"-- Job: {job_dir.name}")
        lines.append("-- --------------------------------------------------------")
        lines.append("")

        for table in sql_plan.get("tables", []):
            table_name = table["name"]
            for record in table.get("records", []):
                pk_value = _guess_primary_key_value(table_name, record)
                if pk_value is not None:
                    pk_column = _primary_key_column(table_name)
                    lines.append(f"DELETE FROM `{table_name}` WHERE `{pk_column}` = {pk_value};")
                columns = ", ".join(f"`{k}`" for k in record.keys())
                values = ", ".join(_sql_value(v) for v in record.values())
                lines.append(f"INSERT INTO `{table_name}` ({columns})")
                lines.append(f"VALUES ({values});")
                lines.append("")

    content = "\n".join(lines)
    if not dry_run:
        sql_file.write_text(content, encoding="utf-8")
    return sql_file


def _primary_key_column(table_name: str) -> str:
    """根据表名推断主键列名。"""
    mapping = {
        "creature_model_info": "DisplayID",
        "creature_template": "entry",
        "item_template": "entry",
    }
    return mapping.get(table_name, "ID")


def _guess_primary_key_value(table_name: str, record: dict[str, Any]) -> Any | None:
    """根据表名和记录推断主键值，用于生成 DELETE 语句。"""
    pk = _primary_key_column(table_name)
    return record.get(pk)


def _copy_assets_to_staging(job_dir: Path, staging: Path) -> list[Path]:
    """将任务的客户端资源复制到 MPQ staging，返回写入的相对路径列表。"""
    assets = load_json(job_dir / "input" / "assets.json")
    raw_folder = assets.get("model_folder") or ""
    model_folder = sanitize_model_folder(raw_folder)

    creature_dir = staging / "Creature" / model_folder
    creature_dir.mkdir(parents=True, exist_ok=True)

    written: list[Path] = []
    for key in ("m2_files", "blp_files", "anim_files"):
        for file_info in assets.get(key, []):
            rel_path = file_info.get("relative_path")
            if not rel_path:
                continue
            src = settings.project_root / rel_path
            if src.exists():
                dst = creature_dir / src.name
                shutil.copy2(src, dst)
                written.append(Path("Creature") / model_folder / src.name)
    return written


def build_mpq(
    jobs: list[Path],
    sql_file: Path,
    dry_run: bool = False,
) -> tuple[Path, dict[str, list[Path]]]:
    """构建批次 MPQ。

    Args:
        jobs: 要处理的任务目录列表。
        sql_file: 已生成的 SQL 文件路径。
        dry_run: 为 True 时只返回路径，不创建文件。

    Returns:
        (mpq_path, {job_name: [相对路径列表]})
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
    for job_dir in jobs:
        job_assets[job_dir.name] = _copy_assets_to_staging(job_dir, staging)

    subprocess.run(
        [str(MPQCLI), "create", str(staging), "--output", str(mpq_path), "--game", "wow-wotlk"],
        check=True,
    )

    readme = mpq_dir / "readme.txt"
    mount_names = ", ".join(
        load_yaml(d / "input" / "resource.yaml").get("official_db", {}).get("name", d.name)
        for d in jobs
    )
    readme.write_text(
        f"Patch: patch-mounts.mpq\n"
        f"Generated: {datetime.now(UTC).isoformat()}\n"
        f"SQL: {sql_file}\n"
        f"Jobs: {', '.join(d.name for d in jobs)}\n"
        f"Mounts: {mount_names}\n",
        encoding="utf-8",
    )

    return mpq_path, job_assets


def update_manifests(
    jobs: list[Path],
    sql_file: Path,
    mpq_path: Path,
    report_path: Path,
    dry_run: bool = False,
) -> None:
    """更新各任务 manifest 为 generated 状态。"""
    now = datetime.now(UTC).isoformat()
    for job_dir in jobs:
        manifest_path = job_dir / "manifest.json"
        manifest = load_json(manifest_path)
        manifest["status"] = "generated"
        manifest["completed_at"] = now
        manifest["summary"] = f"批次处理 {len(jobs)} 个坐骑"
        manifest["artifacts"]["output"] = {
            "dbc_dir": "data/wow-dbc/src/dbc",
            "sql": str(sql_file.relative_to(settings.project_root)),
            "mpq": str(mpq_path.relative_to(settings.project_root)),
            "validation_report": str(report_path.relative_to(settings.project_root)),
        }
        if not dry_run:
            save_json(manifest_path, manifest)


def _record_by_id(dbc_path: Path, record_id: int) -> dict[str, Any] | None:
    """按 ID 查询 DBC 记录。"""
    if not dbc_path.exists():
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


def validate_job(job_dir: Path, mpq_assets: list[Path]) -> JobValidation:
    """对单个任务执行一致性校验，返回校验结果。"""
    resource = load_yaml(job_dir / "input" / "resource.yaml")
    sql_plan = load_yaml(job_dir / "input" / "sql-plan.yaml")
    assets = load_json(job_dir / "input" / "assets.json")
    mount_name = resource.get("official_db", {}).get("name", job_dir.name)

    dbc_cfg = resource.get("dbc", {})
    spell_id = dbc_cfg.get("spell", {}).get("id")
    cmd_id = dbc_cfg.get("creature_model_data", {}).get("id")
    cdi_id = dbc_cfg.get("creature_display_info", {}).get("id")
    visual_id = dbc_cfg.get("spell", {}).get("visual_id")

    db_cfg = resource.get("db", {})
    ct_entry = db_cfg.get("creature_template", {}).get("entry")
    it_record = _find_sql_record(sql_plan, "item_template") or db_cfg.get("item_template", {})
    it_spellid_2 = it_record.get("spellid_2")
    ct_record = _find_sql_record(sql_plan, "creature_template") or db_cfg.get(
        "creature_template", {}
    )
    ct_modelid1 = ct_record.get("modelid1")
    cmi_record = _find_sql_record(sql_plan, "creature_model_info") or db_cfg.get(
        "creature_model_info", {}
    )
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
            name="creature_display_info_id_matches_creature_template_modelid1",
            passed=cdi_id is not None and cdi_id == ct_modelid1,
            expected=cdi_id,
            actual=ct_modelid1,
            message="CreatureDisplayInfo.ID 必须与 creature_template.modelid1 一致",
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
            message="MPQ 中的模型文件路径必须全英文、无空格、无中文",
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
        job_id=job_dir.name,
        mount_name=mount_name,
        passed=passed,
        checks=checks,
    )


def write_validation_report(
    jobs: list[Path],
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
    for job_dir in jobs:
        assets = job_assets.get(job_dir.name, [])
        results.append(validate_job(job_dir, assets))

    data = {
        "generated_at": datetime.now(UTC).isoformat(),
        "batch_size": len(jobs),
        "job_ids": [d.name for d in jobs],
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


def build_mount_patches(
    all_requested: bool = False,
    job_ids: list[str] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """批量构建坐骑补丁的入口函数。

    Args:
        all_requested: 处理所有可处理状态的任务。
        job_ids: 指定任务 ID 列表。
        dry_run: 为 True 时只做校验，不修改文件。

    Returns:
        包含 jobs, sql_file, mpq_path, report_path 的字典。

    Raises:
        DBCConflictError: 检测到 DBC ID 冲突。
        MountPatchBuilderError: 其他构建错误。
    """
    jobs, rebuild_jobs = find_jobs(settings.patch_jobs_dir, all_requested, job_ids)

    print(f"将处理 {len(jobs)} 个任务：")
    for d in jobs:
        marker = "（重建）" if d.name in rebuild_jobs else ""
        print(f"  - {d.name}{marker}")
    print()

    grouped_ops = collect_dbc_operations(jobs)

    print("检查 DBC ID 冲突...")
    conflicts = check_conflicts(grouped_ops, rebuild_jobs)
    if conflicts:
        print("发现 ID 冲突：")
        for job_name, items in conflicts.items():
            details = ", ".join(f"{dbc}#{rid}" for dbc, rid in items)
            print(f"  {job_name}: {details}")
        raise DBCConflictError("存在 DBC ID 冲突，停止构建。")
    print("无冲突。\n")

    print("应用 DBC 操作（直接编辑源 DBC）...")
    apply_dbc_operations(grouped_ops, dry_run=dry_run)

    print("生成批次 SQL...")
    sql_file = generate_sql(jobs, dry_run=dry_run)
    print(f"  {sql_file}\n")

    print("构建批次 MPQ...")
    mpq_path, job_assets = build_mpq(jobs, sql_file, dry_run=dry_run)
    print(f"  {mpq_path}\n")

    timestamp = mpq_path.parent.name
    print("生成校验报告...")
    report_path = write_validation_report(jobs, job_assets, timestamp, dry_run=dry_run)
    print(f"  {report_path}\n")

    print("更新任务 manifest...")
    update_manifests(jobs, sql_file, mpq_path, report_path, dry_run=dry_run)

    if dry_run:
        print("干跑完成，未修改任何文件。")
    else:
        print("完成。请手动提交 data/wow-dbc 子模块的 DBC 改动。")
        print(f"校验报告：{report_path}")

    return {
        "jobs": [d.name for d in jobs],
        "sql_file": str(sql_file),
        "mpq_path": str(mpq_path),
        "report_path": str(report_path),
        "dry_run": dry_run,
    }
