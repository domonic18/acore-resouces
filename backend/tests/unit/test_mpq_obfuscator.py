"""mpq_obfuscator 服务单元测试（mpqcli 输出以 canned stdout mock）。"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest

from app.services import mpq_inspector, mpq_obfuscator


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Path]:
    """将服务常量指向临时目录，返回目录映射。"""
    mpq_dir = tmp_path / "mpq"
    dist_dir = tmp_path / "dist"
    for d in (mpq_dir, dist_dir):
        d.mkdir(parents=True)
    monkeypatch.setattr(mpq_inspector, "MPQ_OUTPUT_DIR", mpq_dir)
    monkeypatch.setattr(mpq_inspector, "DIST_DIR", dist_dir)
    monkeypatch.setattr(
        mpq_inspector,
        "ARCHIVE_ROOTS",
        {"mpq": mpq_dir, "dist": dist_dir},
    )
    return {"mpq": mpq_dir, "dist": dist_dir}


def _make_archive(root: Path, batch: str, name: str = "patch-mounts.mpq") -> Path:
    path = root / batch / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"MPQ\x1a fake")
    return path


def _write_manifest(root: Path, batch: str, manifest: dict[str, Any]) -> None:
    (root / batch / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def _mock_run(
    monkeypatch: pytest.MonkeyPatch,
    *,
    obfuscate_exit: int = 0,
    list_stdout: str = "File00000000.xxx\nFile00000001.xxx\n",
    list_exit: int = 0,
) -> list[list[str]]:
    """替换 mpqcli 调用，记录参数；按子命令返回 canned 结果。"""
    calls: list[list[str]] = []

    def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        if args[0] == "obfuscate":
            return subprocess.CompletedProcess(
                [], obfuscate_exit, "", "" if obfuscate_exit == 0 else "boom"
            )
        return subprocess.CompletedProcess([], list_exit, list_stdout, "")

    monkeypatch.setattr(mpq_obfuscator, "_run", _run)
    return calls


class TestGuards:
    def test_dist_archive_rejected(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["dist"], "b1", "patch-zhCN-4.mpq")
        calls = _mock_run(monkeypatch)

        with pytest.raises(mpq_obfuscator.MpqObfuscationError, match="下架"):
            mpq_obfuscator.obfuscate_archive("dist/b1/patch-zhCN-4.mpq")
        assert calls == []

    def test_missing_manifest_rejected(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b2")
        _mock_run(monkeypatch)

        with pytest.raises(mpq_obfuscator.MpqObfuscationError, match="manifest"):
            mpq_obfuscator.obfuscate_archive("mpq/b2/patch-mounts.mpq")

    def test_corrupt_manifest_rejected(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b3")
        (env["mpq"] / "b3" / "manifest.json").write_text("{broken", encoding="utf-8")
        _mock_run(monkeypatch)

        with pytest.raises(mpq_obfuscator.MpqObfuscationError, match="损坏"):
            mpq_obfuscator.obfuscate_archive("mpq/b3/patch-mounts.mpq")

    def test_already_obfuscated_rejected(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b4")
        _write_manifest(env["mpq"], "b4", {"obfuscation": "basic"})
        calls = _mock_run(monkeypatch)

        with pytest.raises(mpq_obfuscator.MpqObfuscationError, match="已是混淆"):
            mpq_obfuscator.obfuscate_archive("mpq/b4/patch-mounts.mpq")
        assert calls == []

    def test_unknown_archive_raises(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _mock_run(monkeypatch)
        with pytest.raises(mpq_inspector.MpqArchiveNotFoundError):
            mpq_obfuscator.obfuscate_archive("mpq/nope/x.mpq")


class TestObfuscate:
    def test_success_updates_manifest(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b5")
        _write_manifest(env["mpq"], "b5", {"batch": "b5", "obfuscation": "none"})
        calls = _mock_run(monkeypatch)

        result = mpq_obfuscator.obfuscate_archive("mpq/b5/patch-mounts.mpq")

        assert result["obfuscation"] == "basic"
        assert result["obfuscated_at"]
        assert [args[0] for args in calls] == ["obfuscate", "list"]
        manifest = json.loads((env["mpq"] / "b5" / "manifest.json").read_text(encoding="utf-8"))
        assert manifest["obfuscation"] == "basic"
        assert manifest["obfuscated_at"] == result["obfuscated_at"]

    def test_mpqcli_failure_raises(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b6")
        _write_manifest(env["mpq"], "b6", {"obfuscation": "none"})
        _mock_run(monkeypatch, obfuscate_exit=1)

        with pytest.raises(mpq_obfuscator.MpqObfuscationError, match="obfuscate 失败"):
            mpq_obfuscator.obfuscate_archive("mpq/b6/patch-mounts.mpq")
        manifest = json.loads((env["mpq"] / "b6" / "manifest.json").read_text(encoding="utf-8"))
        assert manifest["obfuscation"] == "none"  # 失败不回写

    def test_verification_leak_raises(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b7")
        _write_manifest(env["mpq"], "b7", {"obfuscation": "none"})
        _mock_run(
            monkeypatch,
            list_stdout="DBFilesClient/Mount.dbc\nInterface/icons/a.blp\n",
        )

        with pytest.raises(mpq_obfuscator.MpqObfuscationError, match="真实路径"):
            mpq_obfuscator.obfuscate_archive("mpq/b7/patch-mounts.mpq")
        manifest = json.loads((env["mpq"] / "b7" / "manifest.json").read_text(encoding="utf-8"))
        assert manifest["obfuscation"] == "none"  # 校验失败不回写

    def test_list_failure_raises(
        self, env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _make_archive(env["mpq"], "b8")
        _write_manifest(env["mpq"], "b8", {"obfuscation": "none"})
        _mock_run(monkeypatch, list_exit=2)

        with pytest.raises(mpq_obfuscator.MpqObfuscationError, match="校验失败"):
            mpq_obfuscator.obfuscate_archive("mpq/b8/patch-mounts.mpq")
