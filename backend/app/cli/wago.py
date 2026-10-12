"""通用 wago.tools CLI。"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from app.services.wago_tools import WagoToolsClient

app = typer.Typer(help="wago.tools 资源查询与下载")
console = Console()
logger = logging.getLogger(__name__)


def _configure_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


@app.callback()
def callback(
    verbose: bool = typer.Option(False, "--verbose", "-v", help="输出调试日志"),
) -> None:
    """wago.tools 通用命令行入口。"""
    _configure_logging(verbose)


@app.command("builds", help="列出可用构建")
def builds(
    product: str | None = typer.Option(
        None, "--product", "-p", help="筛选指定产品，如 wow、wow_classic"
    ),
    limit: int | None = typer.Option(None, "--limit", "-n", help="最多显示条数"),
) -> None:
    """列出 wago.tools 上可用的 CASC 构建。"""
    client = WagoToolsClient()
    build_list = client.get_builds(product=product)
    if limit is not None:
        build_list = build_list[:limit]

    if not build_list:
        console.print("未找到构建信息")
        raise typer.Exit(code=1)

    table = Table(title="wago.tools 构建列表")
    table.add_column("product")
    table.add_column("version")
    table.add_column("created_at")
    table.add_column("build_config")
    table.add_column("cdn_config")

    for build in build_list:
        table.add_row(
            build.product,
            build.version,
            build.created_at,
            build.build_config,
            build.cdn_config,
        )

    console.print(table)


@app.command("latest", help="获取最新构建版本")
def latest(
    product: str = typer.Option("wow", "--product", "-p", help="产品标识，如 wow、wow_classic"),
) -> None:
    """获取指定产品的最新构建版本号。"""
    client = WagoToolsClient(product=product)
    version = client.get_latest_version()
    if version is None:
        console.print(f"[red]无法获取 {product} 的最新版本[/red]")
        raise typer.Exit(code=1)
    console.print(version)


@app.command("search", help="搜索 CASC 文件")
def search(
    query: Annotated[str, typer.Argument(help="搜索词，如 interface/icons/inv_meatwagon")],
    version: str | None = typer.Option(None, "--version", help="构建版本号，如 12.0.7.68887"),
    branch: str | None = typer.Option(None, "--branch", help="分支名称，如 wow_classic"),
    product: str = typer.Option("wow", "--product", "-p", help="产品标识"),
    limit: int | None = typer.Option(None, "--limit", "-n", help="最多显示条数"),
) -> None:
    """按路径或名称搜索 wago.tools 文件索引。"""
    client = WagoToolsClient(product=product)
    results = client.search_files(
        query,
        version=version,
        branch=branch,
        product=product,
        limit=limit,
    )

    if not results:
        console.print("未找到匹配文件")
        raise typer.Exit(code=1)

    table = Table(title=f"搜索 '{query}' 结果")
    table.add_column("file_data_id", justify="right")
    table.add_column("path")

    for info in results:
        table.add_row(str(info.file_data_id), info.path)

    console.print(table)


@app.command("download", help="按 FileDataID 或搜索词下载文件")
def download(
    fdid: Annotated[int | None, typer.Argument(help="文件 FileDataID")] = None,
    search_query: str | None = typer.Option(None, "--search", help="搜索词，下载第一个匹配项"),
    output: Path | None = typer.Option(
        None, "--output", "-o", help="输出文件或目录；默认写入当前目录"
    ),
    version: str | None = typer.Option(None, "--version", help="构建版本号"),
    branch: str | None = typer.Option(None, "--branch", help="分支名称"),
    product: str = typer.Option("wow", "--product", "-p", help="产品标识"),
) -> None:
    """下载原始 CASC 文件到本地。

    若提供 ``--search``，先搜索并取第一个结果进行下载；
    否则必须提供 ``fdid``。
    """
    if fdid is None and search_query is None:
        console.print("[red]请提供 fdid 或 --search 参数[/red]")
        raise typer.Exit(code=1)

    client = WagoToolsClient(product=product)

    target_fdid = fdid
    inferred_name: str | None = None
    if target_fdid is None and search_query is not None:
        results = client.search_files(search_query, product=product, branch=branch)
        if not results:
            console.print(f"[red]搜索未找到匹配项: {search_query}[/red]")
            raise typer.Exit(code=1)
        first = results[0]
        target_fdid = first.file_data_id
        inferred_name = Path(first.path).name
        console.print(f"搜索命中: fdid={target_fdid}, path={first.path}")

    assert target_fdid is not None

    output_path = output or Path.cwd()

    if output_path.is_dir() and inferred_name is not None:
        output_path = output_path / inferred_name

    download_version = version
    if download_version is None and branch is None:
        download_version = client.get_latest_version()
        if download_version:
            console.print(f"使用最新版本: {download_version}")

    final_path = client.download_file(
        target_fdid,
        output_path,
        version=download_version,
        branch=branch,
    )

    if final_path is None:
        console.print("[red]下载失败[/red]")
        raise typer.Exit(code=1)

    console.print(f"[green]已下载:[/green] {final_path}")
