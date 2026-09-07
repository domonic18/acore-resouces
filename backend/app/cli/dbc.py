"""DBC 只读查询命令。"""

from __future__ import annotations

import json
from typing import Any

import typer
from rich.console import Console
from rich.markup import escape
from rich.table import Table

from app.services import dbc_annotation, dbc_reader

app = typer.Typer(help="DBC 只读查询（文件列表 / 分页查询 / 记录详情）")
console = Console()


def _format_size(size_bytes: int) -> str:
    """字节数转可读大小。"""
    size = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size_bytes} B"


def _summary_columns(fields: list[dict[str, Any]]) -> list[str]:
    """默认摘要列：ID + 前 5 个 string 字段（与 Web 查看器一致）。"""
    columns = [f["name"] for f in fields if f["name"] == "ID"]
    columns += [f["name"] for f in fields if f["type"] == "string"][:5]
    return columns


@app.command("files", help="列出全部 DBC 文件")
def list_files() -> None:
    """列出 DBC 目录下全部文件（名称、记录数、大小、schema 注册状态）。"""
    result = dbc_reader.list_dbc_files()
    registered = sum(1 for item in result["items"] if item["schema_registered"])

    table = Table(title=f"DBC 文件（共 {result['total']} 个，{registered} 个已注册 schema）")
    table.add_column("文件", style="cyan")
    table.add_column("记录数", justify="right", style="yellow")
    table.add_column("大小", justify="right")
    table.add_column("schema", style="green")
    for item in result["items"]:
        table.add_row(
            escape(item["name"]),
            str(item["record_count"] if item["record_count"] is not None else "?"),
            _format_size(item["size"]),
            "已注册" if item["schema_registered"] else "[dim]未注册[/dim]",
        )
    console.print(table)


@app.command("query", help="分页查询 DBC 记录（--field/--op/--value 单字段过滤）")
def query(
    file: str = typer.Argument(..., help="DBC 文件名，如 Spell.dbc"),
    page: int = typer.Option(1, "--page", "-p", help="页码"),
    page_size: int = typer.Option(20, "--page-size", "-n", help="每页数量"),
    field: str | None = typer.Option(None, "--field", "-f", help="过滤字段名"),
    op: str = typer.Option("eq", "--op", "-o", help="操作符：eq/contains/gt/lt"),
    value: str | None = typer.Option(None, "--value", "-v", help="过滤值"),
    json_output: bool = typer.Option(False, "--json", help="以 JSON 输出"),
) -> None:
    """分页查询指定 DBC 文件的记录。"""
    try:
        result = dbc_reader.query_records(
            file,
            page=page,
            page_size=page_size,
            field=field,
            op=op,
            value=value,
        )
    except dbc_reader.DbcFileNotFoundError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e
    except (dbc_reader.DbcInvalidQueryError, dbc_reader.DbcUnreadableError) as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(2) from e

    if json_output:
        console.print_json(json.dumps(result, ensure_ascii=False))
        return

    columns = _summary_columns(result["fields"])
    annotation_map = {
        item["record_id"]: item["resources"]
        for item in dbc_annotation.get_annotations(
            file, [record["_record_id"] for record in result["items"]]
        )
    }

    table = Table(title=f"{escape(file)}（{result['total']} 条记录，第 {result['page']} 页）")
    table.add_column("ID", style="cyan")
    for column in columns:
        if column != "ID":
            table.add_column(column)
    table.add_column("来源资源", style="magenta")
    for record in result["items"]:
        row = [str(record.get(column, "")) for column in columns]
        resources = annotation_map.get(record["_record_id"])
        row.append(
            "、".join(r["name"] or r["model_folder"] for r in resources) if resources else "—"
        )
        table.add_row(*(escape(cell) for cell in row))
    console.print(table)

    if field:
        console.print(f"[dim]过滤条件：{escape(field)} {escape(op)} {escape(str(value))}[/dim]")
    console.print(
        f"共 {result['total']} 条，第 {result['page']} 页（每页 {result['page_size']} 条，--page 翻页）"
    )


@app.command("get", help="查询单条记录的全字段详情")
def get(
    file: str = typer.Argument(..., help="DBC 文件名，如 Spell.dbc"),
    record_id: int = typer.Argument(..., help="记录 ID（无 ID 字段的表为 1-based 行号）"),
    json_output: bool = typer.Option(False, "--json", help="以 JSON 输出"),
) -> None:
    """查询单条 DBC 记录的全部字段（名称/类型/值）与来源资源。"""
    try:
        result = dbc_reader.get_record(file, record_id)
    except dbc_reader.DbcFileNotFoundError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(1) from e
    except dbc_reader.DbcUnreadableError as e:
        console.print(f"[red]{e}[/red]")
        raise typer.Exit(2) from e
    if result is None:
        console.print(f"[red]记录不存在：{file} #{record_id}[/red]")
        raise typer.Exit(1)

    if json_output:
        console.print_json(json.dumps(result, ensure_ascii=False))
        return

    console.print(
        f"[bold]{escape(file)}[/bold] 记录 [cyan]#{record_id}[/cyan]"
        f"（第 {result['index']} 行，{len(result['fields'])} 个字段）\n"
    )
    table = Table(show_header=False, box=None)
    table.add_column("字段", style="cyan")
    table.add_column("类型", style="dim")
    table.add_column("值")
    for field in result["fields"]:
        table.add_row(
            escape(field["name"]),
            escape(field["type"]),
            escape(str(field["value"])),
        )
    console.print(table)

    resources = dbc_annotation.get_record_annotation(file, record_id)
    if resources:
        names = "、".join(
            f"{r['type']}-{r['id']:04d} {r['name'] or r['model_folder']}" for r in resources
        )
        console.print(f"\n[magenta]来源资源：[/magenta]{escape(names)}")
