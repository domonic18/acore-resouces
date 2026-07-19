import typer

from app.cli import resource as resource_cli
from app.cli import wowhead as wowhead_cli
from app.cli import xlsx as xlsx_cli

app = typer.Typer(help="acore-resouces CLI")
app.add_typer(resource_cli.app, name="resource", help="资源管理")
app.add_typer(xlsx_cli.app, name="xlsx", help="xlsx 导入/导出")
app.add_typer(wowhead_cli.app, name="wowhead", help="Wowhead 官方数据查询")


@app.callback()
def callback() -> None:
    """acore-resouces 命令行工具。"""


if __name__ == "__main__":
    app()
