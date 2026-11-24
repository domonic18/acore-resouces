"""任选两批次的产物对比服务。

对比基于各批次审计报告（workspace/reports/{batch}/audit-report.json）
中的 MPQ 文件清单（path + sha256）与任务集合，纯 JSON 归并：
- 文件维度：added（仅对比批次有）/ removed（仅基准批次有）/
  replaced（同路径不同内容）/ unchanged 计数；
- 坐骑维度：两批 job_id 的差集与交集。
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.schemas.patch import (
    BatchCompareFileEntry,
    BatchCompareJobEntry,
    BatchCompareResult,
)
from app.services.patch_audit import load_audit_by_batch


def _file_hashes(report: dict[str, Any]) -> dict[str, str | None]:
    """提取审计报告的 MPQ 文件清单：path → sha256。"""
    mpq = report.get("mpq")
    files = mpq.get("files", []) if isinstance(mpq, dict) else []
    return {
        str(entry["path"]): entry.get("sha256")
        for entry in files
        if isinstance(entry, dict) and entry.get("path")
    }


def _job_entries(report: dict[str, Any]) -> dict[str, BatchCompareJobEntry]:
    """提取审计报告的任务清单：job_id → 条目。"""
    entries: dict[str, BatchCompareJobEntry] = {}
    for job in report.get("jobs", []):
        if isinstance(job, dict) and job.get("job_id"):
            entries[str(job["job_id"])] = BatchCompareJobEntry(
                job_id=str(job["job_id"]),
                resource_name=job.get("resource_name"),
            )
    return entries


def compare_batches(base_batch: str, against_batch: str) -> BatchCompareResult:
    """对比两个批次的 MPQ 文件清单与坐骑任务集合。

    Args:
        base_batch: 基准批次（界面上点「对比」的那个）。
        against_batch: 对比批次（界面上拉选的那个）；
            added/removed 等差值方向均以「对比批次相对基准批次」为准。

    Raises:
        ValueError: 两个批次相同。
        FileNotFoundError: 任一批次缺少审计报告。
    """
    if base_batch == against_batch:
        raise ValueError("不能与自身对比")
    try:
        base_report = load_audit_by_batch(base_batch)
    except FileNotFoundError as e:
        raise FileNotFoundError(f"批次 {base_batch} 无审计报告") from e
    try:
        against_report = load_audit_by_batch(against_batch)
    except FileNotFoundError as e:
        raise FileNotFoundError(f"批次 {against_batch} 无审计报告") from e

    base_files = _file_hashes(base_report)
    against_files = _file_hashes(against_report)

    files_added: list[str] = []
    files_replaced: list[BatchCompareFileEntry] = []
    files_unchanged = 0
    for path, sha in against_files.items():
        if path not in base_files:
            files_added.append(path)
        elif base_files[path] != sha:
            files_replaced.append(
                BatchCompareFileEntry(path=path, sha_base=base_files[path], sha_against=sha)
            )
        else:
            files_unchanged += 1
    files_removed = [path for path in base_files if path not in against_files]

    base_jobs = _job_entries(base_report)
    against_jobs = _job_entries(against_report)

    return BatchCompareResult(
        base_batch=base_batch,
        against_batch=against_batch,
        generated_at=datetime.now(UTC).isoformat(),
        files_added=sorted(files_added),
        files_removed=sorted(files_removed),
        files_replaced=sorted(files_replaced, key=lambda e: e.path),
        files_unchanged_count=files_unchanged,
        jobs_added=[
            against_jobs[job_id] for job_id in sorted(against_jobs.keys() - base_jobs.keys())
        ],
        jobs_removed=[
            base_jobs[job_id] for job_id in sorted(base_jobs.keys() - against_jobs.keys())
        ],
        jobs_common=[
            base_jobs[job_id] for job_id in sorted(base_jobs.keys() & against_jobs.keys())
        ],
    )
