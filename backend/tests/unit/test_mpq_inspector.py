"""mpq_inspector 服务单元测试（mpqcli 输出以 canned stdout mock）。"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from app.services import mpq_inspector


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Path]:
    """将服务常量指向临时目录，返回目录映射。"""
    mpq_dir = tmp_path / "mpq"
    dist_dir = tmp_path / "dist"
    cache_dir = tmp_path / "mpq-cache"
    for d in (mpq_dir, dist_dir, cache_dir):
        d.mkdir(parents=True)
    monkeypatch.setattr(mpq_inspector, "MPQ_OUTPUT_DIR", mpq_dir)
    monkeypatch.setattr(mpq_inspector, "DIST_DIR", dist_dir)
    monkeypatch.setattr(mpq_inspector, "MPQ_CACHE_DIR", cache_dir)
    monkeypatch.setattr(
        mpq_inspector,
        "ARCHIVE_ROOTS",
        {"mpq": mpq_dir, "dist": dist_dir},
    )
    return {"mpq": mpq_dir, "dist": dist_dir, "cache": cache_dir}


def _make_archive(mpq_dir: Path, batch: str, name: str = "patch-mounts.mpq") -> Path:
    path = mpq_dir / batch / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"MPQ\x1a fake")
    return path


def _write_manifest(mpq_dir: Path, batch: str, manifest: dict[str, Any]) -> None:
    (mpq_dir / batch / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


class TestListArchives:
    def test_scans_both_roots_with_badges(self, env: dict[str, Path]) -> None:
        _make_archive(env["mpq"], "20260907_024029")
        _write_manifest(
            env["mpq"],
            "20260907_024029",
            {
                "batch": "20260907_024029",
                "obfuscation": "none",
                "files": [{"path": "a.dbc"}, {"path": "b.dbc"}],
            },
        )
        dist_archive = _make_archive(env["dist"], "20260907_024029")
        dist_archive.rename(dist_archive.with_name("patch-zhCN-4.mpq"))

        result = mpq_inspector.list_archives()

        assert result["total"] == 2
        by_rel = {item["rel_path"]: item for item in result["items"]}
        ws = by_rel["mpq/20260907_024029/patch-mounts.mpq"]
        assert ws["source"] == "mpq"
        assert ws["obfuscation"] == "none"
        assert ws["file_count"] == 2
        assert ws["has_manifest"] is True
        assert ws["published"] is False
        # dist 档案回 workspace/mpq 找 manifest
        dist = by_rel["dist/20260907_024029/patch-zhCN-4.mpq"]
        assert dist["published"] is True
        assert dist["obfuscation"] == "none"

    def test_dist_ignores_non_patch_files(self, env: dict[str, Path]) -> None:
        stray = _make_archive(env["dist"], "20260907_024029", "notes.mpq")
        assert mpq_inspector.list_archives()["total"] == 0
        assert stray.exists()

    def test_without_manifest_badges_unknown(self, env: dict[str, Path]) -> None:
        _make_archive(env["mpq"], "20260903_010709")
        item = mpq_inspector.list_archives()["items"][0]
        assert item["obfuscation"] is None
        assert item["file_count"] is None
        assert item["has_manifest"] is False


class TestListFiles:
    def test_manifest_source_priority(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        archive = _make_archive(env["mpq"], "b1")
        _write_manifest(
            env["mpq"],
            "b1",
            {
                "files": [
                    {"path": "DBFilesClient/Mount.dbc", "size_bytes": 10, "kind": "dbc"},
                    {"path": "readme.txt", "kind": "asset"},
                ]
            },
        )
        calls: list[list[str]] = []
        monkeypatch.setattr(
            mpq_inspector,
            "_run_mpqcli",
            lambda args: calls.append(args) or subprocess.CompletedProcess([], 0, "", ""),
        )

        result = mpq_inspector.list_files("mpq/b1/patch-mounts.mpq")

        assert result["source"] == "manifest"
        assert result["total_files"] == 2
        # manifest 命中即不调 mpqcli list（info 元信息调用除外）
        assert all(args[0] != "list" for args in calls)

    def test_listfile_fallback(self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch) -> None:
        archive = _make_archive(env["mpq"], "b2")
        (env["mpq"] / "b2" / "listfile.txt").write_text("a.txt\nb.txt\n", encoding="utf-8")
        monkeypatch.setattr(
            mpq_inspector,
            "_run_mpqcli",
            lambda args: subprocess.CompletedProcess(
                [], 0, "a.txt\nb.txt\n" if "-l" in args else "", ""
            ),
        )

        result = mpq_inspector.list_files("mpq/b2/patch-mounts.mpq")

        assert result["source"] == "listfile"
        assert result["total_files"] == 2

    def test_mpqcli_list_fallback(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b3")
        monkeypatch.setattr(
            mpq_inspector,
            "_run_mpqcli",
            lambda args: subprocess.CompletedProcess([], 0, "x/y.dbc\nx/z.lua\n", ""),
        )

        result = mpq_inspector.list_files("mpq/b3/patch-mounts.mpq")

        assert result["source"] == "mpq"
        assert result["total_files"] == 2

    def test_obfuscated_without_manifest_raises(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b4")
        monkeypatch.setattr(
            mpq_inspector,
            "_run_mpqcli",
            lambda args: subprocess.CompletedProcess([], 0, "", ""),
        )

        with pytest.raises(mpq_inspector.MpqInspectionError, match="无法枚举"):
            mpq_inspector.list_files("mpq/b4/patch-mounts.mpq")

    def test_prefix_children_aggregation(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b5")
        _write_manifest(
            env["mpq"],
            "b5",
            {
                "files": [
                    {"path": "DBFilesClient/Mount.dbc", "size_bytes": 100, "kind": "dbc"},
                    {"path": "DBFilesClient/Item.dbc", "size_bytes": 50, "kind": "dbc"},
                    {"path": "Interface/Icons/x.blp", "kind": "icon"},
                ]
            },
        )

        result = mpq_inspector.list_files("mpq/b5/patch-mounts.mpq")

        entries = result["entries"]
        assert [e["name"] for e in entries] == ["DBFilesClient", "Interface"]
        assert entries[0]["type"] == "dir"
        assert entries[0]["file_count"] == 2

        sub = mpq_inspector.list_files("mpq/b5/patch-mounts.mpq", prefix="DBFilesClient")
        names = [e["name"] for e in sub["entries"]]
        assert names == ["Item.dbc", "Mount.dbc"]  # 不区分大小写排序
        mount = sub["entries"][1]
        assert mount["size"] == 100 and mount["kind"] == "dbc"

    def test_search_flatten(self, env: dict[str, Path]) -> None:
        _make_archive(env["mpq"], "b6")
        _write_manifest(
            env["mpq"],
            "b6",
            {
                "files": [
                    {"path": "DBFilesClient/Mount.dbc", "kind": "dbc"},
                    {"path": "Interface/Icons/abc.blp", "kind": "icon"},
                ]
            },
        )

        result = mpq_inspector.list_files("mpq/b6/patch-mounts.mpq", search="MOUNT")

        assert result["truncated"] is False
        assert [e["path"] for e in result["entries"]] == ["DBFilesClient/Mount.dbc"]


class TestPathValidation:
    def test_reject_unknown_root(self, env: dict[str, Path]) -> None:
        with pytest.raises(mpq_inspector.MpqArchiveNotFoundError):
            mpq_inspector.list_files("etc/b1/x.mpq")

    def test_reject_traversal(self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch) -> None:
        _make_archive(env["mpq"], "b7")
        for bad in ("../x.dbc", "/abs.dbc", "a//b.dbc", "a/../b.dbc"):
            with pytest.raises(mpq_inspector.MpqInvalidPathError):
                mpq_inspector.read_file_preview("mpq/b7/patch-mounts.mpq", bad)

    def test_reject_nonexistent_archive(self, env: dict[str, Path]) -> None:
        with pytest.raises(mpq_inspector.MpqArchiveNotFoundError):
            mpq_inspector.list_files("mpq/nope/x.mpq")

    def test_reject_traversal_via_symlink_like_relative(self, env: dict[str, Path]) -> None:
        outside = env["mpq"].parent / "outside.mpq"
        outside.write_bytes(b"x")
        with pytest.raises(mpq_inspector.MpqArchiveNotFoundError):
            # 构造绕过首段白名单的相对路径
            mpq_inspector.list_files("mpq/../outside.mpq")


class TestExtractAndPreview:
    def _fake_extract(self, cache_root: Path) -> Any:
        def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
            assert args[0] == "extract"
            inner = args[args.index("-f") + 1].replace("\\", "/")
            out = Path(args[args.index("-o") + 1])
            target = out.joinpath(*inner.split("/"))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"hello mpq")
            return subprocess.CompletedProcess([], 0, f"[*] Extracted: {inner}\n", "")

        return _run

    def test_extract_caches_and_reuses(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        archive = _make_archive(env["mpq"], "b8")
        counter = {"n": 0}

        def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
            counter["n"] += 1
            return self._fake_extract(env["cache"])(args)

        monkeypatch.setattr(mpq_inspector, "_run_mpqcli", _run)

        first = mpq_inspector.extract_file("mpq/b8/patch-mounts.mpq", "DBFilesClient/Mount.dbc")
        second = mpq_inspector.extract_file("mpq/b8/patch-mounts.mpq", "DBFilesClient/Mount.dbc")

        assert first == second
        assert first.is_file()
        assert counter["n"] == 1  # 第二次命中缓存

    def test_extract_missing_inner_raises(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b9")
        monkeypatch.setattr(
            mpq_inspector,
            "_run_mpqcli",
            lambda args: subprocess.CompletedProcess([], 0, "", ""),
        )
        with pytest.raises(mpq_inspector.MpqFileNotFoundError):
            mpq_inspector.extract_file("mpq/b9/patch-mounts.mpq", "gone.txt")

    def test_text_preview_dispatch(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b10")

        def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
            inner = args[args.index("-f") + 1]
            out = Path(args[args.index("-o") + 1])
            target = out / inner
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes("中文内容".encode("utf-8"))
            return subprocess.CompletedProcess([], 0, "", "")

        monkeypatch.setattr(mpq_inspector, "_run_mpqcli", _run)

        result = mpq_inspector.read_file_preview("mpq/b10/patch-mounts.mpq", "notes.txt")

        assert result["kind"] == "text"
        assert result["content"] == "中文内容"
        assert result["cache_path"] is None  # tmp_path 在 project_root 外

    def test_blp_dbc_binary_dispatch(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b11")

        def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
            inner = args[args.index("-f") + 1].replace("\\", "/")
            out = Path(args[args.index("-o") + 1])
            target = out.joinpath(*inner.split("/"))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"\x00\x01")
            return subprocess.CompletedProcess([], 0, "", "")

        monkeypatch.setattr(mpq_inspector, "_run_mpqcli", _run)

        for inner, kind in (
            ("Interface/Icons/a.blp", "blp"),
            ("DBFilesClient/Mount.dbc", "dbc"),
            ("model.m2", "binary"),
        ):
            result = mpq_inspector.read_file_preview("mpq/b11/patch-mounts.mpq", inner)
            assert result["kind"] == kind
            assert "content" not in result

    def test_oversized_text_falls_back_to_binary(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b12")
        big = mpq_inspector.TEXT_PREVIEW_LIMIT + 1

        def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
            inner = args[args.index("-f") + 1]
            out = Path(args[args.index("-o") + 1])
            target = out / inner
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"a" * big)
            return subprocess.CompletedProcess([], 0, "", "")

        monkeypatch.setattr(mpq_inspector, "_run_mpqcli", _run)

        result = mpq_inspector.read_file_preview("mpq/b12/patch-mounts.mpq", "huge.txt")
        assert result["kind"] == "binary"


class TestRunMpqcli:
    def test_nonzero_exit_raises(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b13")
        monkeypatch.setattr(
            mpq_inspector,
            "_run_mpqcli",
            lambda args: subprocess.CompletedProcess([], 2, "", "boom"),
        )
        with pytest.raises(mpq_inspector.MpqInspectionError, match="boom"):
            mpq_inspector.get_archive_info("mpq/b13/patch-mounts.mpq")

    def test_info_parsing(self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch) -> None:
        _make_archive(env["mpq"], "b14")
        monkeypatch.setattr(
            mpq_inspector,
            "_run_mpqcli",
            lambda args: subprocess.CompletedProcess(
                [],
                0,
                "Format version: 1\nArchive size: 4096 bytes\njunk line\n",
                "",
            ),
        )
        info = mpq_inspector.get_archive_info("mpq/b14/patch-mounts.mpq")
        assert info["format-version"] == "1"
        assert info["archive-size"] == "4096 bytes"
