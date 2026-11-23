"""dist_site 分发站点服务单元测试。"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from app.services import dist_site
from app.services.dist_site import (
    BatchNotFoundError,
    DistSiteError,
    build_dist_tree,
    delete_batch,
    get_batch,
    list_admin_batches,
    read_changelog,
    resolve_download,
    update_batch_meta,
)


@pytest.fixture
def dist_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    d = tmp_path / "dist"
    d.mkdir()
    monkeypatch.setattr(dist_site, "DIST_DIR", d)
    return d


def _make_published_batch(
    dist: Path,
    name: str = "20261123_040000",
    number: int = 6,
    changelog: str = "## 公告",
) -> Path:
    batch = dist / name
    batch.mkdir(parents=True)
    mpq = batch / f"patch-zhCN-{number}.mpq"
    mpq.write_bytes(b"MPQ\x1a fake")
    (batch / "manifest.json").write_text(
        json.dumps(
            {
                "batch": name,
                "obfuscation": "none",
                "generated_at": "2026-11-23T04:00:00+00:00",
                "mount_count": 3,
                "file_count": 100,
                "patch_number": number,
                "patch_file": mpq.name,
                "patch_size_bytes": mpq.stat().st_size,
                "patch_sha256": hashlib.sha256(b"MPQ\x1a fake").hexdigest(),
                "patch_md5": hashlib.md5(b"MPQ\x1a fake").hexdigest(),
            }
        ),
        encoding="utf-8",
    )
    (batch / "changelog.md").write_text(changelog, encoding="utf-8")
    (batch / "readme.txt").write_text("readme", encoding="utf-8")
    return batch


def test_list_batches_maps_patch_fields(dist_dir: Path) -> None:
    """批次摘要对外暴露 patch_*/size_bytes/md5/sha256 兼容字段。"""
    _make_published_batch(dist_dir)

    items = dist_site.list_batches()

    assert len(items) == 1
    meta = items[0]
    assert meta["batch"] == "20261123_040000"
    assert meta["patch_number"] == 6
    assert meta["size_bytes"] == len(b"MPQ\x1a fake")
    assert meta["md5"] == hashlib.md5(b"MPQ\x1a fake").hexdigest()
    assert meta["sha256"] == hashlib.sha256(b"MPQ\x1a fake").hexdigest()
    assert meta["has_mpq"] is True
    assert meta["has_changelog"] is True


def test_list_batches_skips_unpublished_dirs(dist_dir: Path) -> None:
    """无 manifest 或缺 patch_number 的目录不算已上架。"""
    _make_published_batch(dist_dir)
    stray = dist_dir / "20261123_050000"
    stray.mkdir()
    (stray / "patch-mounts.mpq").write_bytes(b"x")  # 未发布（无 manifest）
    broken = dist_dir / "20261123_060000"
    broken.mkdir()
    (broken / "manifest.json").write_text("{}", encoding="utf-8")

    assert [b["batch"] for b in dist_site.list_batches()] == ["20261123_040000"]
    admin = list_admin_batches()
    assert admin["orphans"] == []


def test_list_admin_batches_reports_orphans(dist_dir: Path) -> None:
    """不合法批次名的目录（如手动误建）进 orphans。"""
    _make_published_batch(dist_dir)
    (dist_dir / "junk-dir").mkdir()

    admin = list_admin_batches()

    assert admin["orphans"] == ["junk-dir"]


def test_get_batch_rejects_illegal_name(dist_dir: Path) -> None:
    with pytest.raises(BatchNotFoundError):
        get_batch("../escape")
    with pytest.raises(BatchNotFoundError):
        get_batch("not-a-batch")


def test_read_changelog_reads_file_truth(dist_dir: Path) -> None:
    """changelog 真相源是 changelog.md 文件。"""
    _make_published_batch(dist_dir, changelog="## 新公告")
    assert read_changelog("20261123_040000") == "## 新公告"


def test_update_batch_meta_writes_changelog_file(dist_dir: Path) -> None:
    """changelog 更新写回 changelog.md，不写入 manifest。"""
    _make_published_batch(dist_dir)

    meta = update_batch_meta("20261123_040000", {"changelog": "## 改过的公告"})

    assert (dist_dir / "20261123_040000" / "changelog.md").read_text(
        encoding="utf-8"
    ) == "## 改过的公告"
    assert meta["has_changelog"] is True
    manifest_data = json.loads(
        (dist_dir / "20261123_040000" / "manifest.json").read_text(encoding="utf-8")
    )
    assert "changelog" not in manifest_data


def test_update_batch_meta_updates_manifest_fields(dist_dir: Path) -> None:
    _make_published_batch(dist_dir)

    update_batch_meta("20261123_040000", {"mount_count": 9, "file_count": 200})

    manifest_data = json.loads(
        (dist_dir / "20261123_040000" / "manifest.json").read_text(encoding="utf-8")
    )
    assert manifest_data["mount_count"] == 9
    assert manifest_data["file_count"] == 200
    assert manifest_data["patch_number"] == 6


def test_update_batch_meta_requires_existing_batch(dist_dir: Path) -> None:
    with pytest.raises(BatchNotFoundError):
        update_batch_meta("20261123_040000", {"mount_count": 9})


def test_delete_batch_removes_dir_and_reports_freed(dist_dir: Path) -> None:
    _make_published_batch(dist_dir)
    batch = dist_dir / "20261123_040000"
    expected = sum(f.stat().st_size for f in batch.rglob("*") if f.is_file())

    result = delete_batch("20261123_040000")

    assert result["batch"] == "20261123_040000"
    assert result["existed"] is True
    assert result["freed_bytes"] == expected
    assert not batch.exists()


def test_delete_batch_missing_reports_not_existed(dist_dir: Path) -> None:
    result = delete_batch("20261123_040000")
    assert result["existed"] is False


def test_build_dist_tree_lists_published_batches_with_files(dist_dir: Path) -> None:
    """树只含已上架批次；mpq 节点带校验和，readme 一并暴露。"""
    _make_published_batch(dist_dir)
    stray = dist_dir / "20261123_050000"
    stray.mkdir()
    (stray / "patch-mounts.mpq").write_bytes(b"x")

    tree = build_dist_tree()

    assert tree["type"] == "dir"
    assert len(tree["children"]) == 1
    batch_node = tree["children"][0]
    assert batch_node["name"] == "20261123_040000"
    assert batch_node["meta"]["patch_number"] == 6
    names = {child["name"]: child for child in batch_node["children"]}
    assert set(names) == {"patch-zhCN-6.mpq", "readme.txt"}
    mpq_node = names["patch-zhCN-6.mpq"]
    assert mpq_node["path"] == "20261123_040000/patch-zhCN-6.mpq"
    assert mpq_node["meta"]["md5"] == hashlib.md5(b"MPQ\x1a fake").hexdigest()


def test_resolve_download_allows_mpq_inside_dist(dist_dir: Path) -> None:
    _make_published_batch(dist_dir)
    target = resolve_download("20261123_040000/patch-zhCN-6.mpq")
    assert target.name == "patch-zhCN-6.mpq"
    assert target.is_relative_to(dist_dir.resolve())


def test_resolve_download_rejects_traversal_and_non_mpq(dist_dir: Path) -> None:
    _make_published_batch(dist_dir)

    with pytest.raises(DistSiteError, match="越界|不存在"):
        resolve_download("../secret.mpq")
    with pytest.raises(DistSiteError):
        resolve_download("20261123_040000/readme.txt")
    with pytest.raises(DistSiteError):
        resolve_download("20261123_040000")
    with pytest.raises(DistSiteError):
        resolve_download("20261123_040000/missing.mpq")
