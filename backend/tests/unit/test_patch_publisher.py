"""patch_publisher 发布移动语义单元测试。"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from app.core.config import settings
from app.services import patch_publisher
from app.services.patch_publisher import (
    PatchPublisherError,
    publish_batch,
    publish_patches,
)


@pytest.fixture
def pub_dirs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Path]:
    """将发布范围目录指向临时目录（publish_patches 输出依赖 project_root）。

    默认禁用分发端推送：backend/.env 可能配置了真实 DISTRO_BASE_URL，
    不屏蔽会把测试产物推到线上；推送用例自行覆盖为 True。
    """
    mpq_dir = tmp_path / "mpq"
    dist_dir = tmp_path / "dist"
    mpq_dir.mkdir()
    dist_dir.mkdir()
    monkeypatch.setattr(patch_publisher, "MPQ_DIR", mpq_dir)
    monkeypatch.setattr(patch_publisher, "DIST_DIR", dist_dir)
    monkeypatch.setattr(settings, "project_root", tmp_path)
    monkeypatch.setattr(patch_publisher, "is_distro_configured", lambda: False)
    return {"mpq": mpq_dir, "dist": dist_dir}


def _make_batch(mpq_dir: Path, name: str = "20260907_024029") -> Path:
    """构造含 MPQ/manifest/readme/changelog/staging 的批次目录。"""
    batch = mpq_dir / name
    batch.mkdir(parents=True)
    (batch / "patch-mounts.mpq").write_bytes(b"MPQ\x1a fake")
    (batch / "manifest.json").write_text('{"obfuscation": "basic"}', encoding="utf-8")
    (batch / "readme.txt").write_text("readme", encoding="utf-8")
    (batch / "changelog.md").write_text("## 玩家公告", encoding="utf-8")
    (batch / "staging").mkdir()
    (batch / "staging" / "tmp.txt").write_text("x", encoding="utf-8")
    return batch


def test_publish_batch_moves_mpq_and_copies_metadata(pub_dirs: dict[str, Path]) -> None:
    """发布为移动语义：MPQ 移动改名，元数据随附复制，构建侧目录清理。"""
    batch = _make_batch(pub_dirs["mpq"])

    target = publish_batch(batch, pub_dirs["dist"], 6)

    dist_batch = pub_dirs["dist"] / "20260907_024029"
    assert target == dist_batch / "patch-zhCN-6.mpq"
    assert target.read_bytes() == b"MPQ\x1a fake"
    # dist 侧 manifest 回写发布信息：序号/文件名/大小/校验和
    stamped = json.loads((dist_batch / "manifest.json").read_text(encoding="utf-8"))
    assert stamped["obfuscation"] == "basic"
    assert stamped["patch_number"] == 6
    assert stamped["patch_file"] == "patch-zhCN-6.mpq"
    assert stamped["patch_size_bytes"] == len(b"MPQ\x1a fake")
    assert stamped["patch_sha256"] == hashlib.sha256(b"MPQ\x1a fake").hexdigest()
    assert (dist_batch / "readme.txt").exists()
    assert (dist_batch / "changelog.md").read_text(encoding="utf-8") == "## 玩家公告"
    # 构建侧批次目录（含 staging 中间产物）整体清理
    assert not batch.exists()


def test_publish_batch_without_mpq_raises_before_write(pub_dirs: dict[str, Path]) -> None:
    """无 MPQ 的批次报错且不在 dist 留下任何产物。"""
    batch = pub_dirs["mpq"] / "20260908_000000"
    batch.mkdir()
    (batch / "manifest.json").write_text("{}", encoding="utf-8")

    with pytest.raises(PatchPublisherError):
        publish_batch(batch, pub_dirs["dist"], 6)

    assert not (pub_dirs["dist"] / "20260908_000000").exists()


def test_publish_batches_end_to_end(pub_dirs: dict[str, Path]) -> None:
    """完整发布流程：编号递增，构建侧清理。"""
    _make_batch(pub_dirs["mpq"])

    result = publish_patches(start_number=5)

    assert [item["batch"] for item in result["published"]] == ["20260907_024029"]
    assert result["next_number"] == 6
    assert (pub_dirs["dist"] / "20260907_024029" / "patch-zhCN-5.mpq").exists()
    assert not (pub_dirs["mpq"] / "20260907_024029").exists()


def test_publish_number_continues_after_max_published(pub_dirs: dict[str, Path]) -> None:
    """dist 已有更大序号时，新发布批次续编（WoW 客户端高序号后加载覆盖低序号）。"""
    _make_batch(pub_dirs["mpq"])
    legacy = pub_dirs["dist"] / "20260903_010709"
    legacy.mkdir()
    (legacy / "patch-zhCN-6.mpq").write_bytes(b"z")

    result = publish_patches(start_number=5)

    assert (pub_dirs["dist"] / "20260907_024029" / "patch-zhCN-7.mpq").exists()
    assert result["next_number"] == 8


def test_publish_batches_dry_run_keeps_everything(pub_dirs: dict[str, Path]) -> None:
    """干跑只预览，不移动不清理。"""
    _make_batch(pub_dirs["mpq"])

    result = publish_patches(start_number=5, dry_run=True)

    assert result["published"] == []
    assert (pub_dirs["mpq"] / "20260907_024029" / "patch-mounts.mpq").exists()
    assert not (pub_dirs["dist"] / "20260907_024029").exists()


def test_publish_batches_skip_legacy_published(pub_dirs: dict[str, Path]) -> None:
    """历史复制语义遗留的已发布批次（mpq 侧仍在）跳过不重复发布。"""
    legacy = _make_batch(pub_dirs["mpq"], "20260903_010709")
    dist_batch = pub_dirs["dist"] / "20260903_010709"
    dist_batch.mkdir()
    (dist_batch / "patch-zhCN-5.mpq").write_bytes(b"z")

    result = publish_patches(start_number=5)

    assert result["skipped"] == ["20260903_010709"]
    assert (legacy / "patch-mounts.mpq").exists()


def test_collect_source_batches_ignores_empty_batch(pub_dirs: dict[str, Path]) -> None:
    """无 patch-*.mpq 的批次目录不算可发布批次。"""
    empty = pub_dirs["mpq"] / "20260908_000000"
    empty.mkdir()
    (empty / "readme.txt").write_text("x", encoding="utf-8")

    assert patch_publisher.collect_source_batches() == []


def test_publish_auto_pushes_when_configured(
    pub_dirs: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """配置分发端时发布成功后自动推送，结果计入 distro_pushed。"""
    _make_batch(pub_dirs["mpq"])
    pushed: list[Path] = []
    monkeypatch.setattr(patch_publisher, "is_distro_configured", lambda: True)
    monkeypatch.setattr(
        patch_publisher,
        "push_batch",
        lambda batch_dir, **kw: pushed.append(batch_dir)
        or {"batch": batch_dir.name, "patch_number": 5, "size_bytes": 10},
    )

    result = publish_patches(start_number=5)

    assert result["distro_pushed"] == ["20260907_024029"]
    assert result["distro_push_failed"] == []
    assert [d.name for d in pushed] == ["20260907_024029"]


def test_publish_push_failure_does_not_block_publish(
    pub_dirs: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """推送失败仅告警：本地发布仍成功，批次计入 distro_push_failed。"""
    _make_batch(pub_dirs["mpq"])
    monkeypatch.setattr(patch_publisher, "is_distro_configured", lambda: True)
    from app.services.patch_distro_client import DistroPushError

    def _boom(batch_dir: Path, **kw: object) -> dict[str, object]:
        raise DistroPushError("endpoint down")

    monkeypatch.setattr(patch_publisher, "push_batch", _boom)

    result = publish_patches(start_number=5)

    assert result["distro_pushed"] == []
    assert result["distro_push_failed"] == ["20260907_024029"]
    # 本地发布不受影响
    assert (pub_dirs["dist"] / "20260907_024029" / "patch-zhCN-5.mpq").exists()


def test_publish_without_distro_config_skips_push(
    pub_dirs: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """未配置分发端时不推送（distro_pushed 为空）。"""
    _make_batch(pub_dirs["mpq"])
    monkeypatch.setattr(patch_publisher, "is_distro_configured", lambda: False)
    monkeypatch.setattr(
        patch_publisher, "push_batch", lambda *a, **kw: pytest.fail("不应推送")
    )

    result = publish_patches(start_number=5)

    assert result["distro_pushed"] == []
