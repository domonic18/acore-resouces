"""MPQ 打包与批次 manifest / readme 输出。

将 DBC 必需集、图标基础设施与各任务客户端资源复制到 staging 目录，
调用 tools/wow-mpq-cli 打包为批次 MPQ，并持久化 manifest.json 与 readme.txt。
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import app.services.mount_patch_builder as _facade
from app.core.config import settings
from app.schemas.resource import Mount
from app.services.icon_infrastructure import stage_icon_infrastructure
from app.services.mpq_obfuscator import MpqObfuscationError, obfuscate_mpq_file

from ._context import JobContext, save_json
from ._errors import MountPatchBuilderError
from ._logging import _log

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


def _manifest_kind(rel: Path) -> str:
    """按归档内路径判定清单条目类型。"""
    parts = rel.parts
    if parts[:1] == ("DBFilesClient",):
        return "dbc"
    if parts[:2] == ("Interface", "icons"):
        return "icon"
    return "asset"


def _manifest_files(staging: Path) -> list[dict[str, Any]]:
    """枚举 staging 文件生成清单条目（相对路径 + 体积 + sha256）。

    须在 staging 被 rmtree 前调用；清单本身不打入 MPQ 归档。
    """
    entries: list[dict[str, Any]] = []
    for f in sorted(staging.rglob("*")):
        if not f.is_file():
            continue
        rel = f.relative_to(staging)
        data = f.read_bytes()
        entries.append(
            {
                "path": rel.as_posix(),
                "size_bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "kind": _manifest_kind(rel),
            }
        )
    return entries


def build_mpq(
    contexts: list[JobContext],
    sql_files: list[Path],
    dry_run: bool = False,
    mounts: Sequence[Mount] | None = None,
    obfuscation: str = "none",
) -> tuple[Path, dict[str, list[Path]], dict[str, Any]]:
    """构建批次 MPQ 并持久化 manifest.json。

    Args:
        contexts: 要处理的任务上下文列表。
        sql_files: 已生成的 SQL 文件路径列表（可能为空，表示所有坐骑 SQL 均已存在）。
        dry_run: 为 True 时只返回路径，不创建文件。
        mounts: 全量坐骑资源，用于确定图标基础设施要携带的贴图；
            缺省时从资源仓库加载全部坐骑。
        obfuscation: 混淆等级，"basic" 时打包后剥除档案内 (listfile)/(attributes)。

    Returns:
        (mpq_path, {job_id: [相对路径列表]}, 批次清单 dict)
    """
    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    mpq_dir = _facade.MPQ_OUTPUT_DIR / timestamp
    mpq_path = mpq_dir / _facade.MPQ_FILENAME
    staging = mpq_dir / "staging"

    manifest: dict[str, Any] = {
        "batch": timestamp,
        "mpq": _facade.MPQ_FILENAME,
        "obfuscation": obfuscation,
        "generated_at": datetime.now(UTC).isoformat(),
        "jobs": [ctx.job_id for ctx in contexts],
        "files": [],
    }
    if dry_run:
        return mpq_path, {}, manifest

    mpq_dir.mkdir(parents=True, exist_ok=True)

    dbc_staging = staging / "DBFilesClient"
    dbc_staging.mkdir(parents=True, exist_ok=True)
    # Vehicle.dbc 不属必需集：仅当批次内存在自建载具记录的计划时才打包，
    # 避免每个 MPQ 无条件携带 412 条官方载具记录。
    dbc_files = list(_facade.REQUIRED_DBC_FILES)
    plan_dbc_names = {plan_file.dbc_file for ctx in contexts for plan_file in ctx.dbc_plan.plans}
    # Vehicle.dbc / VehicleSeat.dbc 不属必需集：仅当批次内存在自建载具记录
    # （或自建座位记录）的计划时才打包，避免每个 MPQ 无条件携带官方载具数据。
    if "Vehicle.dbc" in plan_dbc_names:
        dbc_files.append("Vehicle.dbc")
    if "VehicleSeat.dbc" in plan_dbc_names:
        dbc_files.append("VehicleSeat.dbc")
    for dbc_name in dbc_files:
        src = _facade.WOW_DBC_DIR / dbc_name
        if src.exists():
            shutil.copy2(src, dbc_staging / dbc_name)

    if mounts is None:
        from app.services.resource_store import list_resources

        mounts = cast(list[Mount], list_resources("mount"))
    icon_infra = stage_icon_infrastructure(staging, mounts)
    if icon_infra["missing"]:
        manifest["missing_icons"] = icon_infra["missing"]

    job_assets: dict[str, list[Path]] = {}
    for ctx in contexts:
        job_assets[ctx.job_id] = _copy_assets_to_staging(ctx.assets, staging)

    manifest["files"] = _manifest_files(staging)

    subprocess.run(
        [
            str(_facade.MPQCLI),
            "create",
            str(staging),
            "--output",
            str(mpq_path),
            "--game",
            "wow-wotlk",
        ],
        check=True,
    )
    shutil.rmtree(staging, ignore_errors=True)

    if obfuscation == "basic":
        _log("混淆 MPQ（剥除 (listfile)/(attributes)）...")
        try:
            obfuscate_mpq_file(mpq_path)
        except MpqObfuscationError as exc:
            raise MountPatchBuilderError(
                f"MPQ 混淆失败：{exc}", job_ids=[ctx.job_id for ctx in contexts]
            ) from exc

    save_json(mpq_dir / "manifest.json", manifest)

    readme = mpq_dir / "readme.txt"
    mount_names = ", ".join(ctx.resource.official_db.name or ctx.job_id for ctx in contexts)
    sql_section = "\n".join(f"SQL: {f}" for f in sql_files) or "SQL: (无新增)"
    readme.write_text(
        f"Patch: {_facade.MPQ_FILENAME}\n"
        f"Generated: {datetime.now(UTC).isoformat()}\n"
        f"{sql_section}\n"
        f"Jobs: {', '.join(ctx.job_id for ctx in contexts)}\n"
        f"Mounts: {mount_names}\n",
        encoding="utf-8",
    )

    return mpq_path, job_assets, manifest
