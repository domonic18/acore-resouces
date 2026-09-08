"""补丁分发端（acore-patch-distro）推送客户端。

两步推送协议（契约 v1）：
1. ``POST {base_url}/api/admin/batches/{batch}`` —— 精简 JSON 元数据 announce（幂等）；
2. ``PUT  {base_url}/api/admin/batches/{batch}/mpq`` —— MPQ 原始字节流上传，
   分发端校验 size/sha256 后标记 complete，之后才对外可见。

推送失败只告警、不影响本地发布结果，可随时用 CLI ``patch distro-push`` 重试。
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings

CONTRACT_VERSION = 1
UPLOAD_TIMEOUT = 600.0
CHUNK_SIZE = 1024 * 1024
PATCH_NAME_RE = re.compile(r"^patch-zhCN-(\d+)\.mpq$")


class DistroPushError(Exception):
    """分发端推送失败（网络/HTTP 非 2xx/响应异常）。"""


def is_distro_configured() -> bool:
    return bool(settings.distro_base_url.strip() and settings.distro_api_key.strip())


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_push_payload(batch_dir: Path) -> tuple[dict[str, Any], Path]:
    """从本地 dist 批次目录组装契约 payload，返回 (payload, mpq 路径)。

    新批次直接读发布时回写的 patch_* 字段；存量批次（无回写字段）从
    文件名解析序号、现算 sha256 与大小。
    """

    def fail(reason: str) -> None:
        raise DistroPushError(f"批次 {batch_dir.name} 无法组装推送数据：{reason}")

    if not batch_dir.is_dir():
        fail("目录不存在")
        return {}, Path()  # pragma: no cover - fail 一定抛出

    mpq_files = sorted(batch_dir.glob("patch-zhCN-*.mpq"))
    if not mpq_files:
        fail("缺少 patch-zhCN-*.mpq")
        return {}, Path()  # pragma: no cover

    mpq_path = mpq_files[0]
    manifest: dict[str, Any] = {}
    manifest_path = batch_dir / "manifest.json"
    if manifest_path.is_file():
        try:
            loaded = json.loads(manifest_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                manifest = loaded
        except (OSError, json.JSONDecodeError) as e:
            fail(f"manifest.json 解析失败：{e}")

    patch_number = manifest.get("patch_number")
    if not isinstance(patch_number, int):
        m = PATCH_NAME_RE.match(mpq_path.name)
        if not m:
            fail(f"无法从文件名解析补丁序号：{mpq_path.name}")
            return {}, Path()  # pragma: no cover
        patch_number = int(m.group(1))

    size_bytes = manifest.get("patch_size_bytes")
    if not isinstance(size_bytes, int):
        size_bytes = mpq_path.stat().st_size

    sha256 = manifest.get("patch_sha256")
    if not isinstance(sha256, str) or not sha256:
        sha256 = _sha256_file(mpq_path)

    changelog = ""
    changelog_path = batch_dir / "changelog.md"
    if changelog_path.is_file():
        try:
            changelog = changelog_path.read_text(encoding="utf-8")
        except OSError:
            changelog = ""

    files = manifest.get("files")
    file_count = len(files) if isinstance(files, list) else 0
    jobs = manifest.get("jobs")

    payload = {
        "contract_version": CONTRACT_VERSION,
        "patch_number": patch_number,
        "patch_file": mpq_path.name,
        "generated_at": manifest.get("generated_at"),
        "mount_count": len(jobs) if isinstance(jobs, list) else 0,
        "file_count": file_count,
        "obfuscation": manifest.get("obfuscation"),
        "size_bytes": size_bytes,
        "sha256": sha256,
        "changelog": changelog,
    }
    return payload, mpq_path


def _check_response(resp: httpx.Response, action: str) -> None:
    if resp.status_code // 100 != 2:
        raise DistroPushError(f"{action} 失败：HTTP {resp.status_code} {resp.text[:200]}")


def announce_batch(
    batch: str,
    payload: dict[str, Any],
    *,
    base_url: str | None = None,
    api_key: str | None = None,
    timeout: float = 30.0,
) -> None:
    """第一步：推送批次元数据（幂等，重复 announce 更新 pending 元数据）。"""
    url = f"{(base_url or settings.distro_base_url).rstrip('/')}/api/admin/batches/{batch}"
    headers = {"X-Admin-Key": api_key or settings.distro_api_key}
    try:
        resp = httpx.post(url, json=payload, headers=headers, timeout=timeout)
    except httpx.HTTPError as e:
        raise DistroPushError(f"announce 网络失败：{e}") from e
    _check_response(resp, f"announce {batch}")


def upload_mpq(
    batch: str,
    mpq_path: Path,
    *,
    base_url: str | None = None,
    api_key: str | None = None,
) -> None:
    """第二步：流式上传 MPQ 字节（分发端校验 size/sha256 后标记 complete）。"""
    url = f"{(base_url or settings.distro_base_url).rstrip('/')}/api/admin/batches/{batch}/mpq"
    headers = {"X-Admin-Key": api_key or settings.distro_api_key, "Content-Type": "application/octet-stream"}
    try:
        with mpq_path.open("rb") as f:
            resp = httpx.put(url, content=f, headers=headers, timeout=UPLOAD_TIMEOUT)
    except httpx.HTTPError as e:
        raise DistroPushError(f"上传 {batch} 网络失败：{e}") from e
    _check_response(resp, f"上传 {batch}")


def push_batch(
    batch_dir: Path,
    *,
    base_url: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """组装并推送单个批次（announce + upload），返回结果摘要。"""
    batch = batch_dir.name
    payload, mpq_path = build_push_payload(batch_dir)
    announce_batch(batch, payload, base_url=base_url, api_key=api_key)
    upload_mpq(batch, mpq_path, base_url=base_url, api_key=api_key)
    return {"batch": batch, "patch_number": payload["patch_number"], "size_bytes": payload["size_bytes"]}
