from __future__ import annotations

from pathlib import Path

import typer
from rich.console import Console

from app.core.config import settings
from app.sync.xlsx_import import import_xlsx

app = typer.Typer(help="xlsx 导入/导出命令")
console = Console()


@app.command("import", help="从 xlsx 导入资源")
def import_xlsx_cmd(
    type: str = typer.Argument(..., help="资源类型：mount/pet/npc"),
    input: Path | None = typer.Option(None, "--input", "-i", help="xlsx 文件路径"),
    dry_run: bool = typer.Option(False, "--dry-run", "-d", help="仅预览，不写入"),
    limit: int | None = typer.Option(None, "--limit", "-l", help="限制处理行数（测试用）"),
) -> None:
    if input is None:
        filename = {"mount": "坐骑列表.xlsx", "pet": "宠物列表.xlsx", "npc": "NPC列表.xlsx"}[type]
        input = settings.imports_dir / filename

    if not input.exists():
        console.print(f"[red]文件不存在：{input}[/red]")
        raise typer.Exit(1)

    result = import_xlsx(input, type, dry_run=dry_run, limit=limit)
    console.print(f"资源类型：{result['resource_type']}")
    console.print(f"dry_run：{result['dry_run']}")
    console.print(f"成功导入：{result['created']} 条")
    console.print(f"错误数：{len(result['errors'])}")
    if result["errors"]:
        for err in result["errors"]:
            console.print(f"[red]行 {err['row']}: {err['error']}[/red]")
    if dry_run and result["sample"]:
        console.print("样本数据：")
        for item in result["sample"]:
            console.print(item.model_dump())
