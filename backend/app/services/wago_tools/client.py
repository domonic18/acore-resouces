"""通用 wago.tools API 客户端。"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import httpx

from app.services.wago_tools.models import WagoBuildInfo, WagoFileInfo

logger = logging.getLogger(__name__)

WAGO_BASE_URL = "https://wago.tools"
DEFAULT_USER_AGENT = "acore-resources-wago-tools/1.0"


class WagoToolsClient:
    """封装 wago.tools 公开 API，支持查询构建、搜索文件和下载原始 CASC 文件。"""

    def __init__(self, product: str = "wow", timeout: float = 60.0) -> None:
        """初始化客户端。

        Args:
            product: 默认产品标识，如 ``wow``、``wow_classic``。
            timeout: 默认请求超时（秒）。
        """
        self.product = product
        self.timeout = timeout

    def _client(self, timeout: float | None = None) -> httpx.Client:
        return httpx.Client(
            base_url=WAGO_BASE_URL,
            timeout=timeout if timeout is not None else self.timeout,
            follow_redirects=True,
            headers={"User-Agent": DEFAULT_USER_AGENT},
        )

    def get_builds(self, product: str | None = None) -> list[WagoBuildInfo]:
        """获取可用构建列表。

        Args:
            product: 若指定则只返回该产品的构建；否则返回全部产品。

        Returns:
            构建信息列表。
        """
        with self._client() as client:
            try:
                response = client.get("/api/builds", params={"format": "json"})
                response.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("获取 wago.tools 构建列表失败: %s", exc)
                return []

        payload = response.json()
        raw_builds: list[dict[str, Any]] = []
        if isinstance(payload, dict):
            if product:
                product_builds = payload.get(product)
                if isinstance(product_builds, list):
                    raw_builds = product_builds
            else:
                for builds in payload.values():
                    if isinstance(builds, list):
                        raw_builds.extend(builds)
        elif isinstance(payload, list):
            raw_builds = payload

        return [WagoBuildInfo.model_validate(b) for b in raw_builds if isinstance(b, dict)]

    def get_latest_version(self, product: str | None = None) -> str | None:
        """获取指定产品的最新构建版本号。

        Args:
            product: 产品标识，默认使用初始化时指定的 ``product``。

        Returns:
            版本号字符串，如 ``12.0.7.68887``；失败返回 ``None``。
        """
        target_product = product or self.product
        with self._client() as client:
            try:
                response = client.get(f"/api/builds/{target_product}/latest")
                if response.status_code == 404:
                    logger.warning("wago.tools 未找到产品 %s 的最新版本", target_product)
                    return None
                response.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("获取 wago.tools 最新版本失败: %s", exc)
                return None

        data = response.json()
        if isinstance(data, dict):
            version = data.get("version")
            if isinstance(version, str):
                return version
        return None

    def search_files(
        self,
        query: str,
        *,
        version: str | None = None,
        branch: str | None = None,
        product: str | None = None,
        limit: int | None = None,
    ) -> list[WagoFileInfo]:
        """在 wago.tools 文件索引中搜索。

        Args:
            query: 搜索词，如 ``interface/icons/inv_meatwagon``。
            version: 构建版本号。
            branch: 分支名称。
            product: 产品标识。
            limit: 最多返回的结果数量（客户端截断）。

        Returns:
            文件信息列表。
        """
        params: dict[str, Any] = {"search": query, "format": "json"}
        if version:
            params["version"] = version
        if branch:
            params["branch"] = branch
        if product:
            params["product"] = product

        with self._client(timeout=120.0) as client:
            try:
                response = client.get("/api/files", params=params)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("wago.tools 搜索 %r 失败: %s", query, exc)
                return []

        payload = response.json()
        results: list[WagoFileInfo] = []
        if isinstance(payload, dict):
            for fdid_str, path in payload.items():
                try:
                    results.append(WagoFileInfo(file_data_id=int(fdid_str), path=str(path)))
                except ValueError:
                    continue

        if limit is not None:
            results = results[:limit]
        return results

    def download_file(
        self,
        fdid: int,
        output_path: Path | str,
        *,
        version: str | None = None,
        branch: str | None = None,
    ) -> Path | None:
        """通过 FileDataID 下载原始 CASC 文件。

        Args:
            fdid: 文件 Data ID。
            output_path: 输出文件或目录路径。若为目录，则从响应头推断文件名。
            version: 构建版本号；未指定时 wago.tools 使用默认分支的最新构建。
            branch: 分支名称。

        Returns:
            最终写入的文件路径；失败返回 ``None``。
        """
        params: dict[str, Any] = {"download": "1"}
        if version:
            params["version"] = version
        if branch:
            params["branch"] = branch

        destination = Path(output_path)

        with self._client(timeout=120.0) as client:
            try:
                with client.stream("GET", f"/api/casc/{fdid}", params=params) as response:
                    if response.status_code == 404:
                        logger.warning("wago.tools 未找到 fdid=%s", fdid)
                        return None
                    response.raise_for_status()

                    filename = _parse_filename(response.headers.get("content-disposition", ""))
                    if destination.is_dir():
                        destination = destination / (filename or str(fdid))

                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with destination.open("wb") as f:
                        for chunk in response.iter_bytes():
                            f.write(chunk)
            except httpx.HTTPError as exc:
                logger.warning("wago.tools 下载 fdid=%s 失败: %s", fdid, exc)
                return None

        logger.info("wago.tools 下载 fdid=%s 成功 -> %s", fdid, destination)
        return destination


def _parse_filename(content_disposition: str) -> str | None:
    """从 Content-Disposition 头解析文件名。"""
    if not content_disposition:
        return None
    match = re.search(r"filename\*?=([^;]+)", content_disposition)
    if not match:
        return None

    value = match.group(1).strip()
    if value.startswith('"') and value.endswith('"'):
        value = value[1:-1]

    if value.lower().startswith("utf-8''"):
        value = unquote(value[7:])

    return value or None
