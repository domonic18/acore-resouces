"""补丁产物审计服务。

构建时由 mount_patch_builder 调用 write_audit_report 生成批次级
audit-report.json（CLI/HTTP/AI 入口同源）；查阅侧提供按批次与按任务
两个加载入口。任务 job.json 一律裸读（builder 裸写 JSON，不经 Pydantic）。
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.mount_patch_builder import (
    MPQ_OUTPUT_DIR,
    REPORTS_DIR,
    JobContext,
    load_json,
    save_json,
)

_BATCH_PATTERN = re.compile(r"^\d{8}_\d{6}$")
_SAFE_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_\-]+$")


def _diff_against_previous(manifest: dict[str, Any], batch: str) -> dict[str, list[str]] | None:
    """与更早最近一个含 manifest.json 的 MPQ 批次做文件级 diff。

    按 path+sha256 对比，分为 added / replaced / unchanged；
    无更早批次清单时返回 None。
    """
    if not MPQ_OUTPUT_DIR.exists():
        return None
    candidates = sorted(
        d
        for d in MPQ_OUTPUT_DIR.iterdir()
        if d.is_dir()
        and _BATCH_PATTERN.match(d.name)
        and d.name < batch
        and (d / "manifest.json").exists()
    )
    if not candidates:
        return None
    previous = load_json(candidates[-1] / "manifest.json")
    previous_hashes = {f["path"]: f.get("sha256") for f in previous.get("files", [])}
    added: list[str] = []
    replaced: list[str] = []
    unchanged: list[str] = []
    for entry in manifest.get("files", []):
        path = entry["path"]
        if path not in previous_hashes:
            added.append(path)
        elif previous_hashes[path] != entry.get("sha256"):
            replaced.append(path)
        else:
            unchanged.append(path)
    return {"added": added, "replaced": replaced, "unchanged": unchanged}


def write_audit_report(
    contexts: list[JobContext],
    dbc_records: list[dict[str, Any]],
    sql_entries: list[dict[str, Any]],
    manifest: dict[str, Any],
    batch: str,
    dry_run: bool = False,
) -> Path:
    """组装并写入批次级审计报告。

    Args:
        contexts: 本次构建的任务上下文。
        dbc_records: apply_dbc_operations 捕获的字段级变更记录。
        sql_entries: 每任务的 SQL 计划与落盘状态。
        manifest: build_mpq 生成的批次清单。
        batch: 批次时间戳（YYYYMMDD_HHMMSS）。
        dry_run: 为 True 时只返回路径，不落盘。

    Returns:
        审计报告路径。
    """
    report_path = REPORTS_DIR / batch / "audit-report.json"
    if dry_run:
        return report_path

    files = manifest.get("files", [])
    counts_by_kind = dict(Counter(str(f.get("kind", "asset")) for f in files))
    data = {
        "generated_at": datetime.now(UTC).isoformat(),
        "batch": batch,
        "job_ids": [ctx.job_id for ctx in contexts],
        "jobs": [
            {
                "job_id": ctx.job_id,
                "resource_name": ctx.resource.official_db.name or ctx.job_id,
                "model_folder": ctx.resource.model_folder,
            }
            for ctx in contexts
        ],
        "dbc": dbc_records,
        "sql": sql_entries,
        "mpq": {
            "batch": manifest.get("batch", batch),
            "path": manifest.get("mpq", "patch-mounts.mpq"),
            "obfuscation": manifest.get("obfuscation", "none"),
            "file_count": len(files),
            "counts_by_kind": counts_by_kind,
            "files": files,
            "diff": _diff_against_previous(manifest, batch),
        },
    }
    save_json(report_path, data)
    return report_path


def load_audit_by_batch(batch: str) -> dict[str, Any]:
    """按批次时间戳加载审计报告。

    Raises:
        FileNotFoundError: 批次不存在或无审计报告。
    """
    if not _BATCH_PATTERN.match(batch):
        raise FileNotFoundError(f"批次 {batch} 无审计报告")
    report_path = REPORTS_DIR / batch / "audit-report.json"
    if not report_path.exists():
        raise FileNotFoundError(f"批次 {batch} 无审计报告")
    return load_json(report_path)


def load_audit_by_job(job_id: str) -> dict[str, Any]:
    """按任务 ID 加载其所属批次的审计切片。

    job.json 裸读以匹配 builder 的裸写风格（sql_files 等值为列表，
    不经 Pydantic 校验）。

    Raises:
        FileNotFoundError: 任务不存在 / 无审计路径 / 报告文件缺失。
    """
    if not _SAFE_KEY_PATTERN.match(job_id):
        raise FileNotFoundError(f"任务 {job_id} 不存在")
    job_path = settings.patch_jobs_dir / job_id / "job.json"
    if not job_path.exists():
        raise FileNotFoundError(f"任务 {job_id} 不存在")
    manifest = load_json(job_path)

    audit_rel = ((manifest.get("artifacts") or {}).get("output") or {}).get("audit")
    if not audit_rel:
        raise FileNotFoundError(f"任务 {job_id} 构建于审计功能上线前，无审计报告")
    report_path = settings.project_root / str(audit_rel)
    if not report_path.exists():
        raise FileNotFoundError(f"任务 {job_id} 的审计报告文件缺失: {audit_rel}")
    report = load_json(report_path)

    report_job_id = str(manifest.get("job_id") or job_id)
    job_meta: dict[str, Any] = next(
        (j for j in report.get("jobs", []) if j.get("job_id") == report_job_id),
        {},
    )
    sql_entries = [e for e in report.get("sql", []) if e.get("job_id") == report_job_id]
    return {
        "job_id": report_job_id,
        "resource_name": job_meta.get("resource_name") or manifest.get("resource_name") or job_id,
        "model_folder": job_meta.get("model_folder") or manifest.get("resource_model_folder"),
        "report": {
            "batch": report.get("batch"),
            "generated_at": report.get("generated_at"),
            "path": str(audit_rel),
        },
        "dbc": [e for e in report.get("dbc", []) if e.get("job_id") == report_job_id],
        "sql": sql_entries[0] if sql_entries else None,
        "mpq": report.get("mpq"),
    }
