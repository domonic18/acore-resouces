"""补丁生成计划读取服务。

dry-run 会把 DBC/SQL 计划写进 workspace/patch-jobs/{job_id}/plans/，
本服务提供两条读取路径：
- stored：读 dry-run 落盘的快照；
- live  ：按当前真相源现场重算（不落盘），用于「改了 YAML 但还没重新 dry-run」的场景。
"""

from __future__ import annotations

import json
import re
from typing import Any

import yaml

from app.core.config import settings
from app.schemas.patch import DBCPlan, JobPlansOut, SQLPlan
from app.services.mount_patch_builder import (
    MountPatchBuilderError,
    build_job_context,
)

_SAFE_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_\-]+$")


def load_stored_plans(job_id: str) -> JobPlansOut:
    """读取 dry-run 落盘的生成计划。

    Args:
        job_id: 补丁任务 ID。

    Returns:
        落盘的 DBC/SQL 计划与资源清单。

    Raises:
        FileNotFoundError: 任务不存在，或尚未执行过 dry-run。
    """
    _check_job_id(job_id)
    plans_dir = settings.patch_jobs_dir / job_id / "plans"
    dbc_yaml = plans_dir / "dbc-plan.yaml"
    if not dbc_yaml.exists():
        raise FileNotFoundError(f"任务 {job_id} 没有 plans/ 目录（尚未执行过 dry-run）")

    sql_yaml = plans_dir / "sql-plan.yaml"
    assets_json = plans_dir / "assets.json"
    return JobPlansOut(
        job_id=job_id,
        source="stored",
        dbc_plan=DBCPlan(**_read_yaml(dbc_yaml)),
        sql_plan=SQLPlan(**_read_yaml(sql_yaml))
        if sql_yaml.exists()
        else SQLPlan(target_database="", output_sql_file=""),
        assets=_read_json(assets_json) if assets_json.exists() else {},
    )


def build_live_plans(job_id: str) -> JobPlansOut:
    """按当前真相源现场重算生成计划。

    Args:
        job_id: 补丁任务 ID。

    Returns:
        现场计算出的 DBC/SQL 计划与资源清单。

    Raises:
        FileNotFoundError: 任务不存在。
        MountPatchBuilderError: job.json 损坏，或其引用的资源已不存在。
    """
    _check_job_id(job_id)
    job_dir = settings.patch_jobs_dir / job_id
    if not (job_dir / "job.json").exists():
        raise FileNotFoundError(f"任务 {job_id} 不存在")
    context = build_job_context(job_dir)
    return JobPlansOut(
        job_id=job_id,
        source="live",
        dbc_plan=context.dbc_plan,
        sql_plan=context.sql_plan,
        assets=context.assets,
    )


def _check_job_id(job_id: str) -> None:
    """校验任务 ID 合法性，防止路径穿越。"""
    if not _SAFE_KEY_PATTERN.match(job_id):
        raise FileNotFoundError(f"任务 {job_id} 不存在")


def _read_yaml(path: Any) -> dict[str, Any]:
    """读取 YAML 文件为字典。"""
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _read_json(path: Any) -> dict[str, Any]:
    """读取 JSON 文件为字典。"""
    return json.loads(path.read_text(encoding="utf-8")) or {}


__all__ = ["MountPatchBuilderError", "build_live_plans", "load_stored_plans"]
