"""批量构建坐骑补丁的入口编排。

build_mount_patches 串起整个构建流水线：读任务 → 冲突检查 → 应用 DBC →
生成 SQL → 打包 MPQ → 校验报告 → 变更日志 → 审计报告 → 回写任务状态。
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.core.config import settings

from ._context import find_jobs
from ._dbc import apply_dbc_operations, check_conflicts, collect_dbc_operations
from ._errors import DBCConflictError, MountPatchBuilderError
from ._logging import _log, _phase, _progress, reset_callbacks, set_callbacks
from ._mpq import build_mpq
from ._reports import _clear_plans, _dump_plans, update_job_records, write_validation_report
from ._sql import generate_sql


def build_mount_patches(
    all_requested: bool = False,
    job_ids: list[str] | None = None,
    dry_run: bool = False,
    force: bool = False,
    obfuscation: str = "none",
    log: Callable[[str], None] | None = None,
    progress: Callable[[int, int, str | None], None] | None = None,
    phase: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """批量构建坐骑补丁的入口函数。

    Args:
        all_requested: 处理所有可处理状态的任务。
        job_ids: 指定任务 ID 列表。
        dry_run: 为 True 时只做校验并把计划写入任务目录 plans/，不修改任何源文件。
        force: 为 True 时已存在的 DBC 记录按计划强制重写，SQL 跳过历史条目检查，用于全量重建。
        obfuscation: MPQ 混淆等级，"none" 或 "basic"（剥除档案内清单）。
        log: 可选日志回调，接收构建进度文本（如 web 端构建日志缓冲）。
        progress: 可选进度回调，签名 (current, total, job_id)。
        phase: 可选阶段回调，签名 (phase_name)，上报整体构建阶段。

    Returns:
        包含 jobs, sql_files, mpq_path, report_path 的字典。

    Raises:
        DBCConflictError: 检测到 DBC ID 冲突。
        MountPatchBuilderError: 其他构建错误。
    """
    set_callbacks(log, progress, phase)
    try:
        return _build_mount_patches_impl(all_requested, job_ids, dry_run, force, obfuscation)
    except MountPatchBuilderError as exc:
        # 构建中断时把涉及的任务带出来，调用方据此把任务标记为 failed
        if not exc.job_ids:
            exc.job_ids = list(job_ids) if job_ids else []
        raise
    finally:
        reset_callbacks()


def _build_mount_patches_impl(
    all_requested: bool,
    job_ids: list[str] | None,
    dry_run: bool,
    force: bool,
    obfuscation: str = "none",
) -> dict[str, Any]:
    _phase("load")
    contexts, rebuild_jobs = find_jobs(settings.patch_jobs_dir, all_requested, job_ids)

    _log(f"将处理 {len(contexts)} 个坐骑：")
    for ctx in contexts:
        marker = "（重建：覆盖已有 DBC 记录）" if ctx.job_id in rebuild_jobs else ""
        name = ctx.resource.official_db.name or ctx.resource.model_folder
        _log(f"  - {ctx.job_id}  {name}{marker}")
    _log()

    grouped_ops = collect_dbc_operations(contexts)

    _phase("validate")
    _log("检查 DBC ID 冲突...")
    conflicts = check_conflicts(grouped_ops, rebuild_jobs)
    if conflicts:
        _log("发现 ID 冲突：")
        for job_id, items in conflicts.items():
            details = ", ".join(f"{dbc}#{rid}" for dbc, rid in items)
            _log(f"  {job_id}: {details}")
        raise DBCConflictError(
            "存在 DBC ID 冲突，停止构建。",
            job_ids=sorted(conflicts.keys()),
        )
    _log("无冲突。\n")

    if dry_run:
        _dump_plans(contexts)
        _log(f"审查计划已写入各任务目录 plans/ 子目录（共 {len(contexts)} 个任务）。")
        _log("本次是试运行：没有修改任何源文件。确认无误后再执行正式构建。\n")
    else:
        _clear_plans(contexts)

    _phase("apply_dbc")
    _log("应用 DBC 操作（直接编辑源 DBC）...")
    dbc_audit_records = apply_dbc_operations(grouped_ops, dry_run=dry_run, force=force)

    _phase("gen_sql")
    _log("生成坐骑 SQL（每只坐骑独立目录）...")
    sql_files: list[Path] = []
    sql_entries: list[dict[str, Any]] = []
    _progress(0, len(contexts), None)
    for index, ctx in enumerate(contexts, start=1):
        _progress(index, len(contexts), ctx.job_id)
        written = generate_sql(ctx, dry_run=dry_run, force=force)
        mount_name = ctx.resource.official_db.name or ctx.resource.model_folder
        for f in written:
            _log(f"  {mount_name}：{f}")
            sql_files.append(f)
        sql_entries.append(
            {
                "job_id": ctx.job_id,
                "output_sql_file": ctx.sql_plan.output_sql_file,
                "status": "written" if written else "already_exists",
                "tables": ctx.sql_plan.model_dump()["tables"],
            }
        )
    if not sql_files:
        _log("  无新增 SQL（所有坐骑均已存在 SQL 文件）。")
    _log()

    _phase("build_mpq")
    _log("构建 MPQ...")
    mpq_path, job_assets, mpq_manifest = build_mpq(
        contexts, sql_files, dry_run=dry_run, obfuscation=obfuscation
    )
    _log(f"  {mpq_path}\n")

    timestamp = mpq_path.parent.name
    _phase("report")
    _log("生成校验报告...")
    report_path = write_validation_report(contexts, job_assets, timestamp, dry_run=dry_run)
    _log(f"  {report_path}\n")

    changelog_path = mpq_path.parent / "changelog.md"
    if dry_run:
        _log("干跑：跳过变更日志生成。\n")
    else:
        _phase("changelog")
        _log("生成变更日志（changelog.md）...")
        from app.services import changelog_writer

        changelog_ctx = changelog_writer.build_context(
            contexts, sql_files, mpq_manifest, report_path
        )
        changelog_source = changelog_writer.write_changelog(mpq_path.parent, changelog_ctx)
        _log(f"  {changelog_path}（{'AI 起草' if changelog_source == 'ai' else '模板生成'}）\n")

    _phase("audit")
    _log("生成审计报告...")
    from app.services.patch_audit import write_audit_report

    audit_path = write_audit_report(
        contexts, dbc_audit_records, sql_entries, mpq_manifest, timestamp, dry_run=dry_run
    )
    _log(f"  {audit_path}\n")

    _phase("finalize")
    _log("更新任务状态...")
    update_job_records(contexts, sql_files, mpq_path, report_path, audit_path, dry_run=dry_run)

    if dry_run:
        _log("干跑完成，未修改任何源文件。")
    else:
        _log("构建完成。请手动提交 data/wow-dbc 子模块的 DBC 改动。")
        _log(f"校验报告：{report_path}")
        _log(f"审计报告：{audit_path}")

    return {
        "jobs": [ctx.job_id for ctx in contexts],
        "sql_files": [str(f) for f in sql_files],
        "mpq_path": str(mpq_path),
        "report_path": str(report_path),
        "audit_path": str(audit_path),
        "manifest_path": str(mpq_path.parent / "manifest.json"),
        "changelog_path": str(changelog_path),
        "dry_run": dry_run,
    }
