"""任务上下文与通用 IO 助手。

负责 JobContext 的现场构建（按 job.json 引用的资源 ID 回读真相源 YAML）、
patch job 的发现与筛选，以及 YAML/JSON 读写、SQL 软链接、模型目录名清理
等通用助手。
"""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path
from typing import Any, cast

import yaml

import app.services.mount_patch_builder as _facade
from app.core.config import settings
from app.schemas.patch import DBCPlan, SQLPlan
from app.schemas.resource import Mount

from ._errors import MountPatchBuilderError
from ._logging import _log


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


def ensure_sql_symlink() -> None:
    """确保指向 AzerothCore updates 目录的软链接存在。"""
    sql_link_dir = _facade.SQL_LINK_DIR
    sql_link_dir.parent.mkdir(parents=True, exist_ok=True)
    if sql_link_dir.exists() or sql_link_dir.is_symlink():
        return

    real_dir = settings.acore_sql_updates_dir
    if real_dir is None:
        raise FileNotFoundError(
            "未配置 AzerothCore updates 目录。请在 .env 中设置 acore_sql_updates_dir "
            "或 ACORE_SQL_UPDATES_DIR 环境变量。"
        )
    if not real_dir.exists():
        raise FileNotFoundError(f"AzerothCore updates 目录不存在: {real_dir}")

    sql_link_dir.symlink_to(real_dir, target_is_directory=True)
    _log(f"创建软链接: {sql_link_dir} -> {real_dir}")


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
        # 显式指定任务时不过滤状态——用户点名要构建哪个任务就是覆盖意图，
        # 已发布（applied）的任务也允许重建。all_requested 模式才排除 applied，
        # 否则每次「构建全部」都会把已发布的批次重做一遍。
        if not job_ids and status not in ("requested", "generated", "failed"):
            continue
        if status == "generated":
            rebuild.add(d.name)
        try:
            contexts.append(build_job_context(d))
        except MountPatchBuilderError as exc:
            _log(f"  警告：跳过任务 {d.name}: {exc}")

    if not contexts:
        raise MountPatchBuilderError(
            "没有可处理的任务。",
            job_ids=list(job_ids) if job_ids else [],
        )
    return contexts, rebuild
