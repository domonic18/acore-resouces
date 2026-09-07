"""补丁任务管理命令。"""

from __future__ import annotations

import json
import re
from typing import Any

import typer
from rich.console import Console
from rich.markup import escape
from rich.table import Table

from app.schemas.patch import PatchJobStatus
from app.services.build_runner import BuildAlreadyRunningError
from app.services.mount_patch_builder import (
    DBCConflictError,
    MountPatchBuilderError,
    build_mount_patches,
)
from app.services.patch_audit import load_audit_by_batch, load_audit_by_job
from app.services.patch_exporter import (
    create_patch_job,
    delete_patch_job,
    get_patch_job,
    list_patch_jobs,
    update_patch_job_status,
)
from app.services.patch_publisher import PatchPublisherError, publish_patches
from app.services.workspace_cleaner import (
    WorkspaceCleanerError,
    clean_workspace,
)

app = typer.Typer(help="补丁任务管理命令")
console = Console()


def _format_size(size_bytes: int) -> str:
    """字节数转可读大小。"""
    size = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size_bytes} B"


@app.command("export", help="创建补丁任务（仅写任务元数据，构建时现场读取真相源）")
def export_patch(
    resource_type: str = typer.Option("mount", "--type", "-t", help="资源类型"),
    resource_id: int = typer.Option(..., "--id", "-i", help="资源 ID"),
) -> None:
    """为单个资源创建补丁任务。"""
    try:
        manifest = create_patch_job(resource_type, resource_id)
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e

    console.print(f"[green]已创建补丁任务: {manifest.job_id}[/green]")
    console.print(f"任务目录: workspace/patch-jobs/{manifest.job_id}/（仅含 job.json）")
    console.print(
        f"资源真相源: data/resources/{manifest.resource_type}s/{manifest.resource_id:04d}-*.yaml"
    )


@app.command("build", help="构建坐骑补丁（DBC/SQL/MPQ）")
def build_patch(
    all_requested: bool = typer.Option(False, "--all-requested", help="处理所有可处理状态的任务"),
    jobs: list[str] | None = typer.Option(None, "--jobs", help="指定任务 ID 列表"),
    dry_run: bool = typer.Option(
        False, "--dry-run", help="仅校验冲突并落盘审查计划到任务目录 plans/，不修改源文件"
    ),
    force: bool = typer.Option(
        False,
        "--force",
        help="已存在的 DBC 记录按计划强制重写、SQL 跳过历史条目检查（全量重建场景）",
    ),
) -> None:
    """读取补丁任务并批量构建坐骑补丁。"""
    if not all_requested and not jobs:
        console.print("[red]请指定 --all-requested 或 --jobs[/red]")
        raise typer.Exit(1)

    try:
        result = build_mount_patches(
            all_requested=all_requested,
            job_ids=jobs,
            dry_run=dry_run,
            force=force,
        )
    except DBCConflictError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(2) from e
    except MountPatchBuilderError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e

    console.print(f"[green]处理任务: {', '.join(result['jobs'])}[/green]")
    sql_files = result.get("sql_files", [])
    if sql_files:
        for sql_file in sql_files:
            console.print(f"SQL: {sql_file}")
    else:
        console.print("SQL: (无新增)")
    console.print(f"MPQ: {result['mpq_path']}")
    console.print(f"校验报告: {result['report_path']}")
    console.print(f"审计报告: {result['audit_path']}")
    if result["dry_run"]:
        console.print("[yellow]干跑完成，未修改任何文件。[/yellow]")


@app.command("publish", help="发布 MPQ 补丁到分发目录")
def publish_patch(
    start_number: int = typer.Option(5, "--start-number", help="补丁编号起始值"),
    dry_run: bool = typer.Option(False, "--dry-run", help="仅预览，不执行复制"),
) -> None:
    """将 workspace/mpq/ 下未发布的批次复制到 workspace/dist/。"""
    try:
        result = publish_patches(start_number=start_number, dry_run=dry_run)
    except PatchPublisherError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e

    if result["published"]:
        console.print("[green]已发布批次:[/green]")
        for item in result["published"]:
            console.print(f"  {item['batch']} -> {item['path']}")
    if result["skipped"]:
        console.print(f"[yellow]已跳过（已发布）: {', '.join(result['skipped'])}[/yellow]")


@app.command("list", help="列出补丁任务")
def list_patches(
    resource_type: str | None = typer.Option(None, "--type", "-t", help="资源类型"),
    resource_id: int | None = typer.Option(None, "--id", "-i", help="资源 ID"),
    status: PatchJobStatus | None = typer.Option(None, "--status", "-s", help="任务状态"),
    page: int = typer.Option(1, "--page", "-p", help="页码"),
    page_size: int = typer.Option(20, "--page-size", "-n", help="每页数量"),
) -> None:
    """列出补丁任务。"""
    result = list_patch_jobs(
        resource_type=resource_type,
        resource_id=resource_id,
        status=status,
        page=page,
        page_size=page_size,
    )

    table = Table(title="补丁任务列表")
    table.add_column("Job ID", style="cyan")
    table.add_column("资源", style="magenta")
    table.add_column("状态", style="green")
    table.add_column("创建时间", style="yellow")

    for item in result["items"]:
        table.add_row(
            item["job_id"],
            f"{item['resource_type']}-{item['resource_id']:04d} {item['resource_name']}",
            item["status"],
            item["created_at"],
        )

    console.print(table)
    console.print(f"共 {result['total']} 条记录，第 {result['page']} 页")


@app.command("get", help="查看补丁任务详情")
def get_patch(
    job_id: str = typer.Argument(..., help="任务 ID"),
) -> None:
    """查看单个补丁任务详情。"""
    manifest = get_patch_job(job_id)
    if manifest is None:
        console.print(f"[red]未找到任务 {job_id}[/red]")
        raise typer.Exit(1)

    import json

    console.print_json(json.dumps(manifest.model_dump(), ensure_ascii=False, indent=2))


@app.command("update", help="更新补丁任务状态")
def update_patch(
    job_id: str = typer.Argument(..., help="任务 ID"),
    status: PatchJobStatus = typer.Argument(..., help="新状态: requested/generated/applied/failed"),
    summary: str | None = typer.Option(None, "--summary", help="摘要"),
) -> None:
    """更新补丁任务状态。"""
    manifest = update_patch_job_status(job_id, status=status, summary=summary)
    if manifest is None:
        console.print(f"[red]未找到任务 {job_id}[/red]")
        raise typer.Exit(1)

    console.print(f"[green]已更新 {job_id} 状态为 {status}[/green]")


@app.command("audit", help="查看补丁审计报告（任务 ID 或批次时间戳）")
def audit_patch(
    key: str = typer.Argument(
        ..., help="任务 ID（如 mount_0091）或批次时间戳（如 20260906_102929）"
    ),
    json_output: bool = typer.Option(False, "--json", help="以 JSON 输出完整报告"),
) -> None:
    """查看字段级审计报告（DBC before→after / SQL / MPQ 清单）。"""
    try:
        if re.fullmatch(r"\d{8}_\d{6}", key):
            report: dict[str, Any] = load_audit_by_batch(key)
            console.print(
                f"[bold]批次审计 · {escape(key)} · {len(report.get('job_ids', []))} 个任务[/bold]\n"
            )
        else:
            report = load_audit_by_job(key)
            console.print(
                f"[bold]任务审计 · {escape(key)} {escape(str(report.get('resource_name') or ''))}[/bold]\n"
            )
    except FileNotFoundError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e

    if json_output:
        console.print_json(json.dumps(report, ensure_ascii=False, indent=2))
        return

    _print_audit_dbc(report.get("dbc", []))
    _print_audit_sql(report.get("sql"))
    _print_audit_mpq(report.get("mpq"))


def _print_audit_dbc(entries: list[dict[str, Any]]) -> None:
    """渲染 DBC 字段变更表（before 删除线 → after）。"""
    table = Table(title="DBC 字段变更（before → after）")
    table.add_column("文件 · 记录", style="cyan")
    table.add_column("字段")
    table.add_column("变更")
    for entry in entries:
        record_label = f"{entry.get('dbc_file')}\n{entry.get('record_id')}"
        before = entry.get("before")
        after = entry.get("after") or {}
        skipped = entry.get("action_taken") == "skipped_existing"
        for field, new_value in after.items():
            old_value = before.get(field) if before else None
            if skipped:
                change = f"[yellow]源已存在，跳过（现值 {escape(str(old_value))}）[/yellow]"
            elif before is None:
                change = f"[dim]新增记录[/dim] → [green]{escape(str(new_value))}[/green]"
            else:
                change = f"[dim][s]{escape(str(old_value))}[/s][/dim] → [green]{escape(str(new_value))}[/green]"
            table.add_row(escape(record_label), escape(str(field)), change)
        if not after:
            note = "源已存在，跳过" if skipped else "（无字段）"
            table.add_row(escape(record_label), "-", f"[yellow]{note}[/yellow]")
    console.print(table)
    console.print()


def _print_audit_sql(sql: Any) -> None:
    """渲染 SQL 计划（任务切片为 dict，批次报告为 list）。"""
    entries = sql if isinstance(sql, list) else ([sql] if sql else [])
    if not entries:
        console.print("[yellow]无 SQL 计划[/yellow]\n")
        return
    for entry in entries:
        status = entry.get("status")
        marker = "[green]+[/green]" if status == "written" else "[dim]=[/dim]"
        suffix = "（新增）" if status == "written" else "（已存在，未重写）"
        console.print(f"{marker} {escape(str(entry.get('output_sql_file')))}{suffix}")
        for tbl in entry.get("tables", []):
            table_name = tbl.get("name", "?")
            records = tbl.get("records", [])
            for idx, record in enumerate(records):
                prefix = f"[{idx}]." if len(records) > 1 else ""
                for field, value in record.items():
                    console.print(
                        f"    {escape(table_name)}.{prefix}{escape(str(field))} = {escape(str(value))}"
                    )
        console.print()


def _print_audit_mpq(mpq: dict[str, Any] | None) -> None:
    """渲染 MPQ 批次清单摘要。"""
    if not mpq:
        console.print("[yellow]无 MPQ 清单[/yellow]")
        return
    counts = mpq.get("counts_by_kind") or {}
    console.print(
        f"[bold]MPQ 批次[/bold] {escape(str(mpq.get('batch')))} · "
        f"混淆等级 {escape(str(mpq.get('obfuscation')))} · "
        f"文件数 {mpq.get('file_count', 0)}（{escape(str(counts))}）"
    )
    diff = mpq.get("diff")
    if diff is not None:
        console.print(
            f"  与上一批次 diff: 新增 {len(diff.get('added', []))} / "
            f"替换 {len(diff.get('replaced', []))} / 沿用 {len(diff.get('unchanged', []))}"
        )
    files = mpq.get("files", [])
    for entry in files[:20]:
        console.print(f"  {escape(str(entry.get('path')))}")
    if len(files) > 20:
        console.print(f"  … 共 {len(files)} 个文件（--json 查看全量）")


@app.command("delete", help="删除补丁任务（仅移除任务目录，不影响真相源与已生成产物）")
def delete_patch(
    job_id: str = typer.Argument(..., help="任务 ID"),
    yes: bool = typer.Option(False, "--yes", "-y", help="跳过确认"),
) -> None:
    """删除单个补丁任务目录。"""
    manifest = get_patch_job(job_id)
    if manifest is None:
        console.print(f"[red]未找到任务 {job_id}[/red]")
        raise typer.Exit(1)

    console.print(
        f"任务: {job_id}（{manifest.resource_type}-{manifest.resource_id:04d} "
        f"{manifest.resource_name}，状态 {manifest.status}）"
    )
    if not yes:
        typer.confirm("确认删除？仅移除任务目录，不影响真相源与已生成产物", abort=True)

    try:
        delete_patch_job(job_id)
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e
    except BuildAlreadyRunningError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e

    console.print(f"[green]已删除任务 {job_id}[/green]")


@app.command("clean", help="清理工作区中间产物（默认 dry-run 预览，--execute 才真正删除）")
def clean_workspace_cmd(
    execute: bool = typer.Option(False, "--execute", help="真正执行删除（默认仅预览）"),
    older_than: int | None = typer.Option(None, "--older-than", help="仅清理 N 天前的产物"),
    include_published: bool = typer.Option(False, "--include-published", help="包含已发布批次"),
) -> None:
    """预览或清理工作区中间产物（任务记录 / 未发布 MPQ 批次 / 未发布报告）。"""
    if execute:
        typer.confirm("确认清理？已发布批次默认跳过，dist 与真相源永不受影响", abort=True)

    try:
        result = clean_workspace(
            execute=execute,
            older_than_days=older_than,
            include_published=include_published,
        )
    except WorkspaceCleanerError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e

    if result["targets"]:
        table = Table(title="清理目标")
        table.add_column("路径", style="cyan")
        table.add_column("大小", style="yellow", justify="right")
        table.add_column("原因", style="magenta")
        for target in result["targets"]:
            table.add_row(target["path"], _format_size(target["size_bytes"]), target["reason"])
        console.print(table)
    else:
        console.print("没有可清理的产物。")

    if result["skipped"]:
        skipped_table = Table(title="跳过项")
        skipped_table.add_column("路径", style="cyan")
        skipped_table.add_column("原因", style="magenta")
        for item in result["skipped"]:
            skipped_table.add_row(item["path"], item["reason"])
        console.print(skipped_table)

    console.print(f"总计可释放: [yellow]{_format_size(result['total_size_bytes'])}[/yellow]")

    if result["errors"]:
        for err in result["errors"]:
            console.print(f"[red]删除失败 {err['path']}: {err['error']}[/red]")

    if result["dry_run"]:
        console.print("[yellow]dry-run 预览，未删除任何文件；加 --execute 执行[/yellow]")
    else:
        console.print(f"[green]清理完成，共删除 {len(result['targets'])} 个目录[/green]")
