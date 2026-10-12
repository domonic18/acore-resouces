"""MPQ 查看 API 集成测试（伪造档案 + canned mpqcli 输出；真实二进制用例按存在性跳过）。"""

from __future__ import annotations

import json
import struct
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from wow_dbc_tool import FieldDef, SchemaRegistry

from app.main import app
from app.services import mpq_inspector

MPQCLI = mpq_inspector.MPQCLI


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Path]:
    """将服务常量指向临时目录。"""
    mpq_dir = tmp_path / "mpq"
    dist_dir = tmp_path / "dist"
    cache_dir = tmp_path / "mpq-cache"
    for d in (mpq_dir, dist_dir, cache_dir):
        d.mkdir(parents=True)
    monkeypatch.setattr(mpq_inspector, "MPQ_OUTPUT_DIR", mpq_dir)
    monkeypatch.setattr(mpq_inspector, "DIST_DIR", dist_dir)
    monkeypatch.setattr(mpq_inspector, "MPQ_CACHE_DIR", cache_dir)
    monkeypatch.setattr(mpq_inspector, "ARCHIVE_ROOTS", {"mpq": mpq_dir, "dist": dist_dir})
    return {"mpq": mpq_dir, "dist": dist_dir, "cache": cache_dir}


def _make_archive(mpq_dir: Path, batch: str) -> Path:
    path = mpq_dir / batch / "patch-mounts.mpq"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"MPQ\x1a fake")
    return path


def _write_manifest(mpq_dir: Path, batch: str, files: list[dict]) -> None:
    (mpq_dir / batch / "manifest.json").write_text(
        json.dumps({"batch": batch, "obfuscation": "basic", "files": files}),
        encoding="utf-8",
    )


def _write_dbc(path: Path) -> None:
    """手写 mini WDBC：2 条 (ID uint32, Name string off, Score float) 记录。"""
    block = b"\x00alpha\x00beta\x00"
    records = [
        struct.pack("<IIf", 1, 1, 1.5),
        struct.pack("<IIf", 2, 7, 2.5),
    ]
    header = b"WDBC" + struct.pack("<4I", 2, 3, 12, len(block))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + b"".join(records) + block)


def _fake_extract_run(env: dict[str, Path], dbc_names: set[str]):
    """构造 extract mock：文本文件写纯文本，DBC 文件写 mini WDBC。"""

    def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
        assert args[0] == "extract"
        inner = args[args.index("-f") + 1].replace("\\", "/")
        out = Path(args[args.index("-o") + 1])
        target = out.joinpath(*inner.split("/"))
        target.parent.mkdir(parents=True, exist_ok=True)
        if inner.endswith(".dbc"):
            _write_dbc(target)
        else:
            target.write_text(f"content of {inner}\n", encoding="utf-8")
        return subprocess.CompletedProcess([], 0, f"[*] Extracted: {inner}\n", "")

    return _run


@pytest.fixture(autouse=True)
def _register_test_schema():
    SchemaRegistry.register(
        "Mount.dbc",
        [
            FieldDef("ID", "uint32", 0),
            FieldDef("Name", "string", 4),
            FieldDef("Score", "float", 8),
        ],
    )


class TestArchivesEndpoint:
    def test_lists_archives(self, client: TestClient, env: dict[str, Path]) -> None:
        _make_archive(env["mpq"], "b1")
        _write_manifest(env["mpq"], "b1", [{"path": "DBFilesClient/Mount.dbc", "kind": "dbc"}])
        resp = client.get("/api/mpq/archives")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["obfuscation"] == "basic"

    def test_empty(self, client: TestClient, env: dict[str, Path]) -> None:
        assert client.get("/api/mpq/archives").json()["total"] == 0


class TestFilesEndpoint:
    def test_manifest_listing(self, client: TestClient, env: dict[str, Path]) -> None:
        _make_archive(env["mpq"], "b1")
        _write_manifest(
            env["mpq"],
            "b1",
            [
                {"path": "DBFilesClient/Mount.dbc", "kind": "dbc"},
                {"path": "readme.txt", "kind": "asset"},
            ],
        )
        resp = client.get("/api/mpq/files", params={"archive": "mpq/b1/patch-mounts.mpq"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "manifest"
        assert body["obfuscation"] == "basic"
        assert [e["name"] for e in body["entries"]] == ["DBFilesClient", "readme.txt"]

    def test_archive_not_found(self, client: TestClient, env: dict[str, Path]) -> None:
        resp = client.get("/api/mpq/files", params={"archive": "mpq/nope/x.mpq"})
        assert resp.status_code == 404

    def test_unknown_root_rejected(self, client: TestClient, env: dict[str, Path]) -> None:
        resp = client.get("/api/mpq/files", params={"archive": "etc/b1/x.mpq"})
        assert resp.status_code == 404

    def test_enumeration_failure_422(
        self, client: TestClient, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b2")
        monkeypatch.setattr(
            mpq_inspector,
            "_run_mpqcli",
            lambda args: subprocess.CompletedProcess([], 0, "", ""),
        )
        resp = client.get("/api/mpq/files", params={"archive": "mpq/b2/patch-mounts.mpq"})
        assert resp.status_code == 422
        assert "无法枚举" in resp.json()["detail"]


class TestFileEndpoint:
    def test_text_preview(
        self, client: TestClient, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b1")
        _write_manifest(env["mpq"], "b1", [{"path": "readme.txt", "kind": "asset"}])
        monkeypatch.setattr(mpq_inspector, "_run_mpqcli", _fake_extract_run(env, {"Mount.dbc"}))
        resp = client.get(
            "/api/mpq/file",
            params={"archive": "mpq/b1/patch-mounts.mpq", "path": "readme.txt"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["kind"] == "text"
        assert "content of readme.txt" in body["content"]

    def test_bad_path_400(self, client: TestClient, env: dict[str, Path]) -> None:
        _make_archive(env["mpq"], "b1")
        resp = client.get(
            "/api/mpq/file",
            params={"archive": "mpq/b1/patch-mounts.mpq", "path": "../secret.txt"},
        )
        assert resp.status_code == 400

    def test_missing_inner_404(
        self, client: TestClient, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b1")
        monkeypatch.setattr(
            mpq_inspector,
            "_run_mpqcli",
            lambda args: subprocess.CompletedProcess([], 0, "", ""),
        )
        resp = client.get(
            "/api/mpq/file",
            params={"archive": "mpq/b1/patch-mounts.mpq", "path": "gone.txt"},
        )
        assert resp.status_code == 404


class TestDbcEndpoints:
    def test_records_pagination(
        self, client: TestClient, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b1")
        _write_manifest(env["mpq"], "b1", [{"path": "DBFilesClient/Mount.dbc", "kind": "dbc"}])
        monkeypatch.setattr(mpq_inspector, "_run_mpqcli", _fake_extract_run(env, {"Mount.dbc"}))
        resp = client.get(
            "/api/mpq/file/records",
            params={
                "archive": "mpq/b1/patch-mounts.mpq",
                "path": "DBFilesClient/Mount.dbc",
                "page": 1,
                "page_size": 1,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        assert len(body["items"]) == 1
        assert body["items"][0]["Name"] == "alpha"

    def test_record_detail(
        self, client: TestClient, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b1")
        _write_manifest(env["mpq"], "b1", [{"path": "DBFilesClient/Mount.dbc", "kind": "dbc"}])
        monkeypatch.setattr(mpq_inspector, "_run_mpqcli", _fake_extract_run(env, {"Mount.dbc"}))
        resp = client.get(
            "/api/mpq/file/record",
            params={
                "archive": "mpq/b1/patch-mounts.mpq",
                "path": "DBFilesClient/Mount.dbc",
                "record_id": 2,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["record_id"] == 2
        by_name = {f["name"]: f["value"] for f in body["fields"]}
        assert by_name["Name"] == "beta"

    def test_record_not_found(
        self, client: TestClient, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b1")
        _write_manifest(env["mpq"], "b1", [{"path": "DBFilesClient/Mount.dbc", "kind": "dbc"}])
        monkeypatch.setattr(mpq_inspector, "_run_mpqcli", _fake_extract_run(env, {"Mount.dbc"}))
        resp = client.get(
            "/api/mpq/file/record",
            params={
                "archive": "mpq/b1/patch-mounts.mpq",
                "path": "DBFilesClient/Mount.dbc",
                "record_id": 99,
            },
        )
        assert resp.status_code == 404


@pytest.mark.skipif(not MPQCLI.exists(), reason="本地未构建 mpqcli 二进制")
class TestRealMpqcli:
    """真实二进制全链路：create 造档案 → list/extract/records。"""

    def test_full_chain(self, client: TestClient, env: dict[str, Path]) -> None:
        staging = env["mpq"] / "b1" / "staging"
        (staging / "DBFilesClient").mkdir(parents=True)
        _write_dbc(staging / "DBFilesClient" / "Mount.dbc")
        (staging / "readme.txt").write_text("real archive\n", encoding="utf-8")

        archive = env["mpq"] / "b1" / "patch-mounts.mpq"
        subprocess.run(
            [
                str(MPQCLI),
                "create",
                str(staging),
                "--output",
                str(archive),
                "--game",
                "wow-wotlk",
            ],
            check=True,
            capture_output=True,
            timeout=30,
        )
        assert archive.is_file()

        # 无 manifest 时走 ③ mpqcli list（none 混淆内置 (listfile)）
        resp = client.get("/api/mpq/files", params={"archive": "mpq/b1/patch-mounts.mpq"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "mpq"
        names = [e["name"] for e in body["entries"]]
        assert "DBFilesClient" in names and "readme.txt" in names

        # 文本提取
        resp = client.get(
            "/api/mpq/file",
            params={"archive": "mpq/b1/patch-mounts.mpq", "path": "readme.txt"},
        )
        assert resp.status_code == 200
        assert resp.json()["content"] == "real archive\n"

        # DBC 记录读取（提取件经 dbc_reader 解析）
        resp = client.get(
            "/api/mpq/file/records",
            params={
                "archive": "mpq/b1/patch-mounts.mpq",
                "path": "DBFilesClient/Mount.dbc",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 2
