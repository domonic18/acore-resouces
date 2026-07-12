from __future__ import annotations

import typer
from rich.console import Console
from rich.table import Table

from app.schemas.resource import Mount, Npc, Pet
from app.services import resource_store

app = typer.Typer(help="资源管理命令")
console = Console()

TYPE_MAP = {"mount": "mount", "pet": "pet", "npc": "npc"}


@app.command("list", help="列出资源")
def list_resources(
    type: str | None = typer.Option(None, "--type", "-t", help="资源类型：mount/pet/npc"),
    search: str | None = typer.Option(None, "--search", "-s", help="关键词搜索"),
    added: bool | None = typer.Option(None, "--added", help="是否已添加"),
    debug_passed: bool | None = typer.Option(None, "--debug-passed", help="是否调试通过"),
) -> None:
    resources = resource_store.list_resources(type)

    if search:
        search_lower = search.lower()
        resources = [
            r
            for r in resources
            if search_lower in r.model_folder.lower()
            or (r.official_db.name and search_lower in r.official_db.name.lower())
        ]

    if added is not None:
        resources = [r for r in resources if r.added == added]
    if debug_passed is not None:
        resources = [r for r in resources if r.debug_passed == debug_passed]

    table = Table(title="资源列表")
    table.add_column("ID", style="cyan")
    table.add_column("类型", style="green")
    table.add_column("名称", style="magenta")
    table.add_column("模型文件夹", style="yellow")
    table.add_column("调试通过", style="blue")
    table.add_column("已添加", style="blue")

    for r in resources:
        table.add_row(
            str(r.id),
            r.resource_type,
            r.official_db.name or "-",
            r.model_folder,
            "是" if r.debug_passed else "否",
            "是" if r.added else "否",
        )

    console.print(table)
    console.print(f"共 {len(resources)} 条记录")


@app.command("get", help="获取单个资源")
def get_resource(
    type: str = typer.Argument(..., help="资源类型：mount/pet/npc"),
    id: int = typer.Argument(..., help="资源 ID"),
) -> None:
    resource = resource_store.load_resource(type, id)
    if not resource:
        console.print(f"[red]未找到 {type} ID={id}[/red]")
        raise typer.Exit(1)

    import json

    console.print_json(json.dumps(resource.model_dump(), ensure_ascii=False, indent=2))


@app.command("update", help="更新资源字段")
def update_resource(
    type: str = typer.Argument(..., help="资源类型：mount/pet/npc"),
    id: int = typer.Argument(..., help="资源 ID"),
    field: str = typer.Argument(..., help="字段路径，如 official_db.name=新名称"),
) -> None:
    resource = resource_store.load_resource(type, id)
    if not resource:
        console.print(f"[red]未找到 {type} ID={id}[/red]")
        raise typer.Exit(1)

    if "=" not in field:
        console.print("[red]字段参数格式应为 key=value[/red]")
        raise typer.Exit(1)

    key, value = field.split("=", 1)
    data = resource.model_dump()
    parts = key.split(".")
    current = data
    for part in parts[:-1]:
        current = current[part]
    current[parts[-1]] = value

    schema_cls = {"mount": Mount, "pet": Pet, "npc": Npc}[type]
    updated = schema_cls(**data)
    resource_store.save_resource(updated)
    console.print(f"[green]已更新 {type} ID={id} {key}={value}[/green]")


@app.command("delete", help="删除资源")
def delete_resource(
    type: str = typer.Argument(..., help="资源类型：mount/pet/npc"),
    id: int = typer.Argument(..., help="资源 ID"),
    yes: bool = typer.Option(False, "--yes", "-y", help="跳过确认"),
) -> None:
    if not yes:
        confirm = typer.confirm(f"确认删除 {type} ID={id}？")
        if not confirm:
            raise typer.Abort()

    if resource_store.delete_resource(type, id):
        console.print(f"[green]已删除 {type} ID={id}[/green]")
    else:
        console.print(f"[red]未找到 {type} ID={id}[/red]")
        raise typer.Exit(1)


@app.command("validate", help="校验资源")
def validate_resource(
    type: str | None = typer.Option(None, "--type", "-t", help="资源类型：mount/pet/npc"),
    id: int | None = typer.Option(None, "--id", "-i", help="资源 ID"),
) -> None:
    resources = (
        [resource_store.load_resource(type, id)]
        if type and id
        else resource_store.list_resources(type)
    )

    errors: list[str] = []
    for r in resources:
        if r is None:
            continue
        if not r.model_folder:
            errors.append(f"ID={r.id} 缺少 model_folder")
        if not r.official_db.name:
            errors.append(f"ID={r.id} 缺少 official_db.name")

    if errors:
        for err in errors:
            console.print(f"[red]{err}[/red]")
        raise typer.Exit(1)

    console.print(f"[green]校验通过，共 {len(resources)} 条资源[/green]")
