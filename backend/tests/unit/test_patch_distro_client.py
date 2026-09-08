"""patch_distro_client 推送客户端单元测试。"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.services.patch_distro_client import (
    DistroPushError,
    announce_batch,
    build_push_payload,
    push_batch,
    upload_mpq,
)

PATCH_BYTES = b"MPQ\x1a fake patch bytes"  # 21 字节


def _make_dist_batch(
    dist_dir: Path,
    name: str = "20260908_055924",
    *,
    stamped: bool = True,
    with_changelog: bool = True,
) -> Path:
    """构造 dist 侧批次目录（可选回写字段与 changelog）。"""
    batch = dist_dir / name
    batch.mkdir(parents=True)
    (batch / "patch-zhCN-7.mpq").write_bytes(PATCH_BYTES)
    manifest: dict[str, Any] = {
        "batch": name,
        "generated_at": "2026-09-08T05:59:24+00:00",
        "obfuscation": "none",
        "jobs": ["mount_0003", "mount_0004"],
        "files": [{"path": f"DBFilesClient/{i}.dbc"} for i in range(5)],
    }
    if stamped:
        manifest.update(
            {
                "patch_number": 7,
                "patch_file": "patch-zhCN-7.mpq",
                "patch_size_bytes": len(PATCH_BYTES),
                "patch_sha256": hashlib.sha256(PATCH_BYTES).hexdigest(),
            }
        )
    (batch / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )
    if with_changelog:
        (batch / "changelog.md").write_text("## 玩家公告\n\n内容", encoding="utf-8")
    return batch


def test_build_payload_uses_stamped_manifest(tmp_path: Path) -> None:
    """新批次：payload 直接取回写的 patch_* 字段与 changelog。"""
    batch = _make_dist_batch(tmp_path)

    payload, mpq = build_push_payload(batch)

    assert mpq.name == "patch-zhCN-7.mpq"
    assert payload["contract_version"] == 1
    assert payload["patch_number"] == 7
    assert payload["patch_file"] == "patch-zhCN-7.mpq"
    assert payload["size_bytes"] == len(PATCH_BYTES)
    assert payload["sha256"] == hashlib.sha256(PATCH_BYTES).hexdigest()
    assert payload["mount_count"] == 2
    assert payload["file_count"] == 5
    assert payload["obfuscation"] == "none"
    assert payload["changelog"].startswith("## 玩家公告")


def test_build_payload_legacy_batch_falls_back(tmp_path: Path) -> None:
    """存量批次：序号从文件名解析，sha256/大小现算，无 changelog 为空串。"""
    batch = _make_dist_batch(tmp_path, stamped=False, with_changelog=False)

    payload, _ = build_push_payload(batch)

    assert payload["patch_number"] == 7
    assert payload["size_bytes"] == len(PATCH_BYTES)
    assert payload["sha256"] == hashlib.sha256(PATCH_BYTES).hexdigest()
    assert payload["changelog"] == ""


def test_build_payload_without_mpq_raises(tmp_path: Path) -> None:
    batch = tmp_path / "20260908_055924"
    batch.mkdir()
    (batch / "manifest.json").write_text("{}", encoding="utf-8")

    with pytest.raises(DistroPushError, match="缺少"):
        build_push_payload(batch)


def _fake_post(payload_code: int = 200) -> tuple[Any, list[dict[str, Any]]]:
    calls: list[dict[str, Any]] = []

    def _post(url: str, **kwargs: Any) -> httpx.Response:
        calls.append({"url": url, **kwargs})
        return httpx.Response(payload_code, json={"ok": payload_code == 200})

    return _post, calls


def test_announce_sends_json_with_admin_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import patch_distro_client as client

    fake, calls = _fake_post()
    monkeypatch.setattr(client.httpx, "post", fake)

    announce_batch(
        "20260908_055924",
        {"patch_number": 7},
        base_url="http://distro:8090",
        api_key="secret",
    )

    assert calls[0]["url"] == "http://distro:8090/api/admin/batches/20260908_055924"
    assert calls[0]["headers"] == {"X-Admin-Key": "secret"}
    assert calls[0]["json"] == {"patch_number": 7}


def test_announce_http_error_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import patch_distro_client as client

    fake, _ = _fake_post(payload_code=401)
    monkeypatch.setattr(client.httpx, "post", fake)

    with pytest.raises(DistroPushError, match="401"):
        announce_batch("20260908_055924", {}, base_url="http://x", api_key="k")


def test_upload_streams_file_and_checks_response(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import patch_distro_client as client

    calls: list[dict[str, Any]] = []

    def _put(url: str, **kwargs: Any) -> httpx.Response:
        calls.append({"url": url, **kwargs})
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(client.httpx, "put", _put)
    mpq = tmp_path / "patch-zhCN-7.mpq"
    mpq.write_bytes(b"bytes")

    upload_mpq("20260908_055924", mpq, base_url="http://distro:8090", api_key="secret")

    assert calls[0]["url"] == "http://distro:8090/api/admin/batches/20260908_055924/mpq"
    assert calls[0]["headers"]["X-Admin-Key"] == "secret"
    assert calls[0]["content"] is not None  # 文件对象流式上传


def test_push_batch_announce_then_upload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import patch_distro_client as client

    order: list[str] = []

    def _post(url: str, **kwargs: Any) -> httpx.Response:
        order.append("announce")
        return httpx.Response(200, json={})

    def _put(url: str, **kwargs: Any) -> httpx.Response:
        order.append("upload")
        return httpx.Response(200, json={})

    monkeypatch.setattr(client.httpx, "post", _post)
    monkeypatch.setattr(client.httpx, "put", _put)
    batch = _make_dist_batch(tmp_path)

    result = push_batch(batch, base_url="http://distro:8090", api_key="secret")

    assert order == ["announce", "upload"]
    assert result["batch"] == "20260908_055924"
    assert result["patch_number"] == 7


def test_push_batch_upload_failure_raises(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import patch_distro_client as client

    monkeypatch.setattr(client.httpx, "post", lambda url, **kw: httpx.Response(200, json={}))
    monkeypatch.setattr(
        client.httpx, "put", lambda url, **kw: httpx.Response(400, text="sha256 mismatch")
    )
    batch = _make_dist_batch(tmp_path)

    with pytest.raises(DistroPushError, match="sha256 mismatch"):
        push_batch(batch, base_url="http://x", api_key="k")
