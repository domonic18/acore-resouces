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
    assert stamped["patch_md5"] == hashlib.md5(b"MPQ\x1a fake").hexdigest()
    assert (dist_batch / "readme.txt").exists()
    assert (dist_batch / "changelog.md").read_text(encoding="utf-8") == "## 玩家公告"
    # 构建侧批次目录（含 staging 中间产物）整体清理
    assert not batch.exists()


def test_publish_batch_marks_jobs_applied(
    pub_dirs: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """发布后把批次内的任务标记为 applied，并更新产物路径登记。

    路径登记不更新的话，产物清单里的 MPQ 链接会指向发布前那个
    已被移动走的位置，点开是 404。
    """
    batch = _make_batch(pub_dirs["mpq"])
    (batch / "manifest.json").write_text(
        json.dumps({"jobs": ["mount_0003", "mount_0004"]}), encoding="utf-8"
    )

    marked: list[tuple[str, str, dict | None]] = []
    monkeypatch.setattr("app.services.patch_exporter.get_patch_job", lambda job_id: None)
    monkeypatch.setattr(
        "app.services.patch_exporter.update_patch_job_status",
        lambda job_id, status, output_artifacts=None, summary=None: marked.append(
            (job_id, status, output_artifacts)
        ),
    )

    publish_batch(batch, pub_dirs["dist"], 6)

    assert [(job_id, status) for job_id, status, _ in marked] == [
        ("mount_0003", "applied"),
        ("mount_0004", "applied"),
    ]


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


def test_publish_dry_run_reports_preview(pub_dirs: dict[str, Path]) -> None:
    """干跑必须如实回报「将要发布什么」。

    早期实现干跑时 published 恒为空，前端只能显示
    「没有找到可发布的批次」，把预览误报成失败。
    """
    batch = _make_batch(pub_dirs["mpq"], "20260101_000000")

    result = publish_patches(start_number=7, dry_run=True, batch_ids=[batch.name])

    assert result["published"] == []
    assert result["preview"], "干跑必须返回将要发布的批次"
    preview = result["preview"][0]
    assert preview["batch"] == batch.name
    assert preview["patch_number"] == 7
    assert preview["path"].endswith("patch-zhCN-7.mpq")
    # 干跑不能移动任何文件
    assert batch.exists()
    assert not (pub_dirs["dist"] / batch.name).exists()


def test_publish_batch_filter_limits_scope(pub_dirs: dict[str, Path]) -> None:
    """指定批次时只处理该批次，不动其它未发布批次。"""
    wanted = _make_batch(pub_dirs["mpq"], "20260101_000000")
    other = _make_batch(pub_dirs["mpq"], "20260101_000001")

    result = publish_patches(start_number=7, dry_run=True, batch_ids=[wanted.name])

    assert [item["batch"] for item in result["preview"]] == [wanted.name]
    assert other.name not in [item["batch"] for item in result["preview"]]


def test_publish_returns_same_shape_when_no_batches(pub_dirs: dict[str, Path]) -> None:
    """没有可发布批次时，返回的字段集必须与正常路径一致。

    早期实现在这个提前返回里漏了 preview，前端读 preview.length 会崩。
    """
    result = publish_patches(start_number=5, dry_run=True, batch_ids=["__none__"])

    assert set(result) == {"published", "skipped", "preview", "next_number"}
    assert result["preview"] == []


def test_publish_batch_updates_mpq_path_registration(
    pub_dirs: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """发布是移动语义，MPQ 换了位置——job.json 的产物登记必须跟着更新。"""
    from app.schemas.patch import PatchJobManifest

    batch = _make_batch(pub_dirs["mpq"])
    (batch / "manifest.json").write_text(json.dumps({"jobs": ["mount_0003"]}), encoding="utf-8")

    manifest = PatchJobManifest(
        job_id="mount_0003",
        created_at="2026-01-01T00:00:00+00:00",
        created_by="system",
        resource_type="mount",
        resource_id=3,
        resource_name="测试坐骑",
        resource_model_folder="TestMount",
        status="generated",
        artifacts={"output": {"mpq": "workspace/mpq/old/patch-mounts.mpq"}},
    )
    monkeypatch.setattr("app.services.patch_exporter.get_patch_job", lambda job_id: manifest)

    captured: list[dict | None] = []
    monkeypatch.setattr(
        "app.services.patch_exporter.update_patch_job_status",
        lambda job_id, status, output_artifacts=None, summary=None: captured.append(
            output_artifacts
        ),
    )

    publish_batch(batch, pub_dirs["dist"], 6)

    assert captured, "应更新产物登记"
    assert captured[0] is not None
    assert captured[0]["mpq"].endswith("patch-zhCN-6.mpq")
    assert "dist" in captured[0]["mpq"]
