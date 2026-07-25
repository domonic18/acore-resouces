"""补丁任务管理命令。"""

from __future__ import annotations

import typer
from rich.console import Console
from rich.table import Table

from app.services.mount_patch_builder import (
    DBCConflictError,
    MountPatchBuilderError,
    build_mount_patches,
)
from app.services.patch_exporter import (
    create_patch_job,
    get_patch_job,
    list_patch_jobs,
    update_patch_job_status,
)
from app.services.patch_publisher import PatchPublisherError, publish_patches

app = typer.Typer(help="补丁任务管理命令")
console = Console()


@app.command("export", help="导出补丁原料包")
def export_patch(
    resource_type: str = typer.Option("mount", "--type", "-t", help="资源类型"),
    resource_id: int = typer.Option(..., "--id", "-i", help="资源 ID"),
) -> None:
    """为单个资源导出补丁原料包。"""
    try:
        manifest = create_patch_job(resource_type, resource_id)
    except ValueError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e

    console.print(f"[green]已创建补丁任务: {manifest.job_id}[/green]")
    console.print(f"输入目录: {manifest.input_dir}")
    console.print(f"输出目录: {manifest.output_dir}")


@app.command("build", help="构建坐骑补丁（DBC/SQL/MPQ）")
def build_patch(
    all_requested: bool = typer.Option(False, "--all-requested", help="处理所有可处理状态的任务"),
    jobs: list[str] | None = typer.Option(None, "--jobs", help="指定任务 ID 列表"),
    dry_run: bool = typer.Option(False, "--dry-run", help="仅校验冲突，不修改文件"),
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
        )
    except DBCConflictError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(2) from e
    except MountPatchBuilderError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e

    console.print(f"[green]处理任务: {', '.join(result['jobs'])}[/green]")
    console.print(f"SQL: {result['sql_file']}")
    console.print(f"MPQ: {result['mpq_path']}")
    console.print(f"校验报告: {result['report_path']}")
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
    status: str | None = typer.Option(None, "--status", "-s", help="任务状态"),
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
    status: str = typer.Argument(..., help="新状态: requested/generated/applied/failed"),
    summary: str | None = typer.Option(None, "--summary", help="摘要"),
) -> None:
    """更新补丁任务状态。"""
    manifest = update_patch_job_status(job_id, status=status, summary=summary)
    if manifest is None:
        console.print(f"[red]未找到任务 {job_id}[/red]")
        raise typer.Exit(1)

    console.print(f"[green]已更新 {job_id} 状态为 {status}[/green]")
