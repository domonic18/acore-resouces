"""补丁校验报告读取服务。

构建时由 mount_patch_builder 写出批次级 validation-report.json；
本服务提供按批次与按任务两个加载入口，供 HTTP 层暴露给界面。
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.schemas.patch import ValidationReportOut
from app.services.mount_patch_builder import REPORTS_DIR, load_json

_BATCH_PATTERN = re.compile(r"^\d{8}_\d{6}$")
_SAFE_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_\-]+$")

# 「任务 ID → 批次号」索引缓存（按 reports 目录 mtime 失效）
_batch_index_cache: dict[str, str] | None = None
_batch_index_stamp: float | None = None


def load_validation_report_by_batch(batch: str) -> ValidationReportOut:
    """按批次时间戳读取校验报告。

    Args:
        batch: MPQ 批次目录名，格式 YYYYMMDD_HHMMSS。

    Returns:
        整批次的校验报告。

    Raises:
        FileNotFoundError: 批次格式非法或报告不存在。
    """
    if not _BATCH_PATTERN.match(batch):
        raise FileNotFoundError(f"批次 {batch} 无校验报告")
    report_path = REPORTS_DIR / batch / "validation-report.json"
    if not report_path.exists():
        raise FileNotFoundError(f"批次 {batch} 无校验报告")
    return _to_report(load_json(report_path), batch=batch, path=report_path)


def find_batch_for_job(job_id: str) -> str | None:
    """找出包含指定任务的批次号。

    任务的 job.json 里登记了产物路径，正常情况下直接查得到报告；
    但任务被重新创建过（旧实现会清空 artifacts）时登记就丢了——
    这时从批次报告里反查，报告本身仍然覆盖该任务。

    Args:
        job_id: 补丁任务 ID。

    Returns:
        批次号；找不到时返回 None。
    """
    return _job_batch_index().get(job_id)


def _job_batch_index() -> dict[str, str]:
    """构建「任务 ID → 批次号」索引（按 reports 目录 mtime 缓存）。"""
    global _batch_index_cache, _batch_index_stamp
    if not REPORTS_DIR.exists():
        return {}

    stamp = REPORTS_DIR.stat().st_mtime
    if _batch_index_cache is not None and _batch_index_stamp == stamp:
        return _batch_index_cache

    index: dict[str, str] = {}
    for batch_dir in sorted(REPORTS_DIR.iterdir()):
        if not batch_dir.is_dir():
            continue
        report_path = batch_dir / "validation-report.json"
        if not report_path.exists():
            continue
        try:
            report = load_json(report_path)
        except (json.JSONDecodeError, OSError):
            continue
        for job in report.get("jobs", []) or []:
            job_id = job.get("job_id")
            if job_id:
                # 按目录名升序遍历，后者更新——保留最新批次
                index[str(job_id)] = batch_dir.name

    _batch_index_cache = index
    _batch_index_stamp = stamp
    return index


def load_validation_report_by_job(job_id: str) -> ValidationReportOut:
    """按任务 ID 读取其所属批次的校验报告切片。

    优先用任务自己登记的报告路径；登记丢失时（例如任务被重新创建过）
    回退到批次报告中该任务的记录。

    Args:
        job_id: 补丁任务 ID，形如 mount_0003。

    Returns:
        只含该任务的校验报告。

    Raises:
        FileNotFoundError: 任务不存在，或任何批次报告里都找不到该任务。
    """
    if not _SAFE_KEY_PATTERN.match(job_id):
        raise FileNotFoundError(f"任务 {job_id} 不存在")
    job_path = settings.patch_jobs_dir / job_id / "job.json"
    if not job_path.exists():
        raise FileNotFoundError(f"任务 {job_id} 不存在")

    manifest = load_json(job_path)
    output = (manifest.get("artifacts") or {}).get("output") or {}
    report_rel = output.get("validation_report")

    if report_rel:
        report_path = settings.project_root / str(report_rel)
        if report_path.exists():
            report = load_json(report_path)
            job_entry = next(
                (job for job in report.get("jobs", []) if job.get("job_id") == job_id),
                None,
            )
            if job_entry is not None:
                sliced = dict(report)
                sliced["jobs"] = [job_entry]
                sliced["batch_size"] = len(sliced.get("jobs") or [])
                return _to_report(sliced, batch=report_path.parent.name, path=report_path)
        # 登记的路径失效（报告被清理等），继续走批次回退
        raise FileNotFoundError(f"任务 {job_id} 登记的校验报告已不存在：{report_rel}")

    batch = find_batch_for_job(job_id)
    if batch is None:
        raise FileNotFoundError(
            f"任务 {job_id} 没有校验报告：任务未被构建过，或构建记录已被重新创建覆盖"
        )

    batch_report = load_validation_report_by_batch(batch)
    job_entry = next((job for job in batch_report.jobs if job.job_id == job_id), None)
    if job_entry is None:
        raise FileNotFoundError(f"批次 {batch} 的校验报告中无任务 {job_id}")
    return ValidationReportOut(
        batch=batch_report.batch,
        generated_at=batch_report.generated_at,
        batch_size=1,
        job_ids=[job_id],
        all_passed=job_entry.passed,
        path=batch_report.path,
        jobs=[job_entry],
    )


def _to_report(raw: dict[str, Any], *, batch: str, path: Path) -> ValidationReportOut:
    """把落盘的原始报告转换为响应模型。"""
    return ValidationReportOut(
        batch=batch,
        generated_at=raw.get("generated_at"),
        batch_size=int(raw.get("batch_size") or len(raw.get("jobs") or [])),
        job_ids=list(raw.get("job_ids") or []),
        all_passed=bool(raw.get("all_passed")),
        path=str(path),
        jobs=list(raw.get("jobs") or []),
    )
