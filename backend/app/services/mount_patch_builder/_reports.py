"""校验报告输出、dry-run 计划落盘与任务状态回写。"""

from __future__ import annotations

import shutil
from datetime import UTC, datetime
from pathlib import Path

import app.services.mount_patch_builder as _facade
from app.core.config import settings

from ._checks import JobValidation
from ._context import JobContext, _write_json, _write_yaml, save_json
from ._validation import validate_job


def write_validation_report(
    contexts: list[JobContext],
    job_assets: dict[str, list[Path]],
    timestamp: str,
    dry_run: bool = False,
) -> Path:
    """生成并写入校验报告。"""
    report_dir = _facade.REPORTS_DIR / timestamp
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


def update_job_records(
    contexts: list[JobContext],
    sql_files: list[Path],
    mpq_path: Path,
    report_path: Path,
    audit_path: Path,
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
            "audit": str(audit_path.relative_to(settings.project_root)),
        }
        manifest["artifacts"] = artifacts
        if not dry_run:
            save_json(ctx.job_dir / "job.json", manifest)
