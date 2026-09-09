"""补丁批次聚合查询服务。

job 元数据按坐骑粒度落在 workspace/patch-jobs/{job_id}/job.json（builder 裸写），
本模块按 MPQ 批次（artifacts.output.mpq 的父目录时间戳）将其聚合为
导出任务维度，供前端"补丁批次列表"展示聚合信息与 per-坐骑审计摘要。
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any, cast

from app.core.config import settings
from app.schemas.patch import PatchBatch, PatchBatchJob, PatchBatchJobAudit, PatchJobStatus
from app.services.mount_patch_builder import MPQ_OUTPUT_DIR, REPORTS_DIR, load_json

PENDING_BATCH_ID = "pending"


def _load_job_raw(job_dir: Path) -> dict[str, Any] | None:
    """裸读 job.json（匹配 builder 裸写风格，不经 Pydantic 校验）。"""
    path = job_dir / "job.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return data if isinstance(data, dict) else None


def _batch_key(job: dict[str, Any]) -> str:
    """批次键：mpq 相对路径的父目录名；无 mpq（未构建）归入 pending。"""
    output = (job.get("artifacts") or {}).get("output") or {}
    mpq = output.get("mpq")
    if not mpq:
        return PENDING_BATCH_ID
    return Path(str(mpq)).parent.name or PENDING_BATCH_ID


def _batch_created_at(key: str, jobs: list[dict[str, Any]]) -> str | None:
    """批次创建时间：优先 mpq manifest.json 的 generated_at，回退 job 时间戳最大值。"""
    if key != PENDING_BATCH_ID:
        manifest_path = MPQ_OUTPUT_DIR / key / "manifest.json"
        if manifest_path.exists():
            try:
                generated = load_json(manifest_path).get("generated_at")
            except (json.JSONDecodeError, OSError):
                generated = None
            if generated:
                return str(generated)
    stamps = [
        str(s)
        for j in jobs
        for s in (j.get("completed_at"), j.get("updated_at"), j.get("created_at"))
        if s
    ]
    return max(stamps) if stamps else None


def _aggregate_status(jobs: list[dict[str, Any]]) -> PatchJobStatus:
    """聚合批次状态：含 failed 优先 failed；全部 generated/applied 才算 generated。"""
    statuses = {str(j.get("status") or "requested") for j in jobs}
    if "failed" in statuses:
        return "failed"
    if statuses and statuses <= {"generated", "applied"}:
        return "generated"
    return "requested"


def _batch_output(key: str, jobs: list[dict[str, Any]]) -> dict[str, Any]:
    """聚合批次产物路径（相对项目根）；pending 批次无 MPQ 产物。"""
    outputs: list[dict[str, Any]] = []
    for j in jobs:
        raw = (j.get("artifacts") or {}).get("output")
        if isinstance(raw, dict):
            outputs.append(raw)

    sql_files: list[str] = []
    for out in outputs:
        for f in out.get("sql_files") or []:
            if f and str(f) not in sql_files:
                sql_files.append(str(f))

    first = outputs[0] if outputs else {}
    output: dict[str, Any] = {
        "dbc_dir": first.get("dbc_dir"),
        "sql_files": sql_files,
        "validation_report": first.get("validation_report"),
        "audit": first.get("audit"),
    }
    if key != PENDING_BATCH_ID:
        mpq_dir = Path("workspace/mpq") / key
        output["mpq"] = str(mpq_dir / "patch-mounts.mpq")
        output["manifest"] = str(mpq_dir / "manifest.json")
        output["changelog"] = str(mpq_dir / "changelog.md")
        output["readme"] = str(mpq_dir / "readme.txt")
    return output


def _job_audit_summaries(
    key: str, jobs: list[dict[str, Any]]
) -> dict[str, PatchBatchJobAudit]:
    """按批次审计报告（每批次一次文件读）生成 per-job 文件/表级摘要。"""
    if key == PENDING_BATCH_ID:
        return {}
    report_path = REPORTS_DIR / key / "audit-report.json"
    if not report_path.exists():
        return {}
    try:
        report = load_json(report_path)
    except (json.JSONDecodeError, OSError):
        return {}

    dbc_counts: dict[str, Counter[str]] = {}
    for entry in report.get("dbc", []):
        if not isinstance(entry, dict):
            continue
        job_id = str(entry.get("job_id") or "")
        dbc_counts.setdefault(job_id, Counter())[str(entry.get("dbc_file") or "?")] += 1

    sql_by_job = {
        str(e.get("job_id")): e for e in report.get("sql", []) if isinstance(e, dict)
    }
    summaries: dict[str, PatchBatchJobAudit] = {}
    for job in jobs:
        job_id = str(job.get("job_id"))
        sql_entry = sql_by_job.get(job_id)
        summaries[job_id] = PatchBatchJobAudit(
            dbc_files=[
                {"dbc_file": name, "record_count": count}
                for name, count in sorted(dbc_counts.get(job_id, Counter()).items())
            ],
            sql_file=str(sql_entry.get("output_sql_file")) if sql_entry else None,
            sql_tables=[
                {"name": str(t.get("name")), "record_count": len(t.get("records") or [])}
                for t in (sql_entry or {}).get("tables", [])
                if isinstance(t, dict)
            ],
        )
    return summaries


def list_patch_batches(status: PatchJobStatus | None = None) -> list[PatchBatch]:
    """按导出批次聚合列出补丁任务，批次按创建时间倒序。

    Args:
        status: 按批次聚合状态过滤（None 返回全部）。

    Returns:
        批次聚合视图列表。
    """
    jobs_dir = settings.patch_jobs_dir
    groups: dict[str, list[dict[str, Any]]] = {}
    if jobs_dir.exists():
        for job_dir in sorted(jobs_dir.iterdir()):
            if not job_dir.is_dir():
                continue
            job = _load_job_raw(job_dir)
            if job is None:
                continue
            groups.setdefault(_batch_key(job), []).append(job)

    batches: list[PatchBatch] = []
    for key, jobs in groups.items():
        batch_status = _aggregate_status(jobs)
        if status and batch_status != status:
            continue
        audits = _job_audit_summaries(key, jobs)
        batch_jobs = [
            PatchBatchJob(
                job_id=str(j.get("job_id") or "?"),
                resource_id=int(j.get("resource_id") or 0),
                resource_name=str(
                    j.get("resource_name") or j.get("resource_model_folder") or "?"
                ),
                status=cast(PatchJobStatus, str(j.get("status") or "requested")),
                completed_at=j.get("completed_at"),
                summary=j.get("summary"),
                audit=audits.get(str(j.get("job_id"))),
            )
            for j in sorted(jobs, key=lambda x: int(x.get("resource_id") or 0))
        ]
        batches.append(
            PatchBatch(
                batch_id=key,
                created_at=_batch_created_at(key, jobs),
                status=batch_status,
                job_count=len(jobs),
                output=_batch_output(key, jobs),
                jobs=batch_jobs,
            )
        )

    batches.sort(key=lambda b: b.created_at or "", reverse=True)
    return batches
