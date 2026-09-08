"""patch_publisher 发布移动语义单元测试。"""

from __future__ import annotations

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
    """将发布范围目录指向临时目录（publish_patches 输出依赖 project_root）。"""
    mpq_dir = tmp_path / "mpq"
    dist_dir = tmp_path / "dist"
    mpq_dir.mkdir()
    dist_dir.mkdir()
    monkeypatch.setattr(patch_publisher, "MPQ_DIR", mpq_dir)
    monkeypatch.setattr(patch_publisher, "DIST_DIR", dist_dir)
    monkeypatch.setattr(settings, "project_root", tmp_path)
    return {"mpq": mpq_dir, "dist": dist_dir}


def _make_batch(mpq_dir: Path, name: str = "20260907_024029") -> Path:
    """构造含 MPQ/manifest/readme/staging 的批次目录。"""
    batch = mpq_dir / name
    batch.mkdir(parents=True)
    (batch / "patch-mounts.mpq").write_bytes(b"MPQ\x1a fake")
    (batch / "manifest.json").write_text('{"obfuscation": "basic"}', encoding="utf-8")
    (batch / "readme.txt").write_text("readme", encoding="utf-8")
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
    assert (dist_batch / "manifest.json").read_text(encoding="utf-8") == (
        '{"obfuscation": "basic"}'
    )
    assert (dist_batch / "readme.txt").exists()
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
