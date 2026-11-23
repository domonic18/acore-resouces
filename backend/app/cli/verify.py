"""闭环验证命令。

坐骑此前只能靠用户在 Windows 客户端里肉眼确认是否发白/不出现；这里把
「YAML → DBC → M2 贴图表 → 模型目录 .blp」这条链路的静态审计前移到仓库内，
让问题在提交前就能暴露。
"""

from __future__ import annotations

import json
from typing import cast

import typer
from rich.console import Console
from rich.markup import escape
from rich.table import Table

from app.schemas.resource import Mount
from app.services import mount_audit, mount_db_verifier
from app.services.resource_store import list_resources, load_resource

app = typer.Typer(help="闭环验证（坐骑资源闭包静态审计）")
console = Console()


def _load_mounts(resource_id: int | None, model_folder: str | None) -> list[Mount]:
    """按筛选条件取坐骑资源。"""
    if resource_id is not None:
        resource = load_resource("mount", resource_id)
        if resource is None:
            console.print(f"[red]找不到坐骑资源：{resource_id:04d}[/red]")
            raise typer.Exit(1)
        return [cast(Mount, resource)]

    mounts = cast(list[Mount], list_resources("mount"))
    if model_folder:
        mounts = [m for m in mounts if m.model_folder == model_folder]
    return mounts


@app.command("mounts", help="审计坐骑资源闭包（DBC / 模型 / 贴图）")
def verify_mounts(
    resource_id: int | None = typer.Option(None, "--id", help="只审计指定坐骑 ID"),
    model_folder: str | None = typer.Option(None, "--model-folder", help="只审计指定模型目录"),
    show_warnings: bool = typer.Option(True, "--warnings/--no-warnings", help="是否输出提示性问题"),
    json_output: bool = typer.Option(False, "--json", help="以 JSON 输出"),
) -> None:
    """审计坐骑资源闭包，发现会导致模型发白或坐骑不出现的问题。

    退出码：0 = 无阻断性问题，1 = 存在阻断性问题，2 = 校验过程失败。
    """
    mounts = _load_mounts(resource_id, model_folder)
    if not mounts:
        console.print("[yellow]没有匹配的坐骑资源[/yellow]")
        raise typer.Exit(0)

    report = mount_audit.audit_mounts(mounts)

    if json_output:
        console.print_json(json.dumps(mount_audit.audit_report_to_dict(report), ensure_ascii=False))
        raise typer.Exit(1 if report.error_count else 0)

    failed = report.failed_mounts
    if failed:
        table = Table(title=f"存在阻断性问题的坐骑（共 {len(failed)} 个）")
        table.add_column("ID", style="cyan", justify="right")
        table.add_column("模型目录")
        table.add_column("问题")
        for result in failed:
            for issue in result.errors:
                table.add_row(
                    f"{result.resource_id:04d}",
                    escape(result.model_folder),
                    escape(issue.message),
                )
        console.print(table)
    else:
        console.print("[green]✅ 未发现阻断性问题[/green]")

    if show_warnings:
        warned = [r for r in report.results if r.warnings]
        if warned:
            table = Table(title=f"提示性问题（共 {report.warning_count} 条）")
            table.add_column("ID", style="cyan", justify="right")
            table.add_column("代码", style="yellow")
            table.add_column("说明")
            for result in warned:
                for issue in result.warnings:
                    table.add_row(
                        f"{result.resource_id:04d}",
                        escape(issue.code),
                        escape(issue.message),
                    )
            console.print(table)

    console.print(
        f"审计 {len(report.results)} 个坐骑："
        f"[red]{report.error_count} 个阻断性问题[/red]、"
        f"[yellow]{report.warning_count} 条提示[/yellow]"
    )
    raise typer.Exit(1 if report.error_count else 0)


@app.command("db", help="校验坐骑数据行是否已落地到测试服数据库")
def verify_db(
    resource_id: int | None = typer.Option(None, "--id", help="只校验指定坐骑 ID"),
    model_folder: str | None = typer.Option(None, "--model-folder", help="只校验指定模型目录"),
    json_output: bool = typer.Option(False, "--json", help="以 JSON 输出"),
) -> None:
    """比对 YAML 声明的数据行与线上 ``acore_world``，找出未落地的坐骑。

    退出码：0 = 全部落地，1 = 存在未落地的坐骑，2 = 数据库不可用。
    """
    mounts = _load_mounts(resource_id, model_folder)
    if not mounts:
        console.print("[yellow]没有匹配的坐骑资源[/yellow]")
        raise typer.Exit(0)

    report = mount_db_verifier.check_mounts_db(mounts)

    if report.skipped:
        console.print(f"[yellow]跳过数据库校验：{report.skip_reason}[/yellow]")
        raise typer.Exit(2)

    if json_output:
        console.print_json(
            json.dumps(
                {
                    "summary": {
                        "mounts": len(report.results),
                        "missing_rows": report.error_count,
                        "failed_mounts": len(report.failed_mounts),
                    },
                    "results": [
                        {
                            "resource_id": result.resource_id,
                            "model_folder": result.model_folder,
                            "name": result.name,
                            "missing": [check.description for check in result.missing],
                        }
                        for result in report.results
                    ],
                },
                ensure_ascii=False,
            )
        )
        raise typer.Exit(1 if report.error_count else 0)

    failed = report.failed_mounts
    if failed:
        table = Table(title=f"数据未落地的坐骑（共 {len(failed)} 个）")
        table.add_column("ID", style="cyan", justify="right")
        table.add_column("名称")
        table.add_column("缺失行")
        for result in failed:
            table.add_row(
                f"{result.resource_id:04d}",
                escape(result.name),
                escape("、".join(check.description for check in result.missing)),
            )
        console.print(table)
    else:
        console.print("[green]✅ 所有坐骑数据均已落地[/green]")

    console.print(f"校验 {len(report.results)} 个坐骑：[red]{report.error_count} 行缺失[/red]")
    raise typer.Exit(1 if report.error_count else 0)
