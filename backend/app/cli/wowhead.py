"""Wowhead 查询 CLI。"""

from __future__ import annotations

import typer

from app.services import wowhead

app = typer.Typer(help="Wowhead 官方数据查询")


@app.command("lookup-mount", help="查询 Wowhead 坐骑官方数据（自动回退 WotLK/零售版与中英文）")
def lookup_mount(query: str = typer.Argument(..., help="坐骑中文或英文名称")) -> None:
    """以 JSON 格式输出 Wowhead 查询结果。"""
    print(wowhead.search_mount_json(query))
