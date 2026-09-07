"""工作区中间产物清理服务单元测试。"""

from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

from app.services import workspace_cleaner
from app.services.workspace_cleaner import WorkspaceCleanerError, clean_workspace


@pytest.fixture
def cleaner_dirs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Path]:
    """把清理范围四目录指向临时目录。"""
    dirs = {
        "patch_jobs": tmp_path / "patch-jobs",
        "mpq": tmp_path / "mpq",
        "reports": tmp_path / "reports",
        "dist": tmp_path / "dist",
    }
    for d in dirs.values():
        d.mkdir(parents=True)
    monkeypatch.setattr(workspace_cleaner, "PATCH_JOBS_DIR", dirs["patch_jobs"])
    monkeypatch.setattr(workspace_cleaner, "MPQ_DIR", dirs["mpq"])
    monkeypatch.setattr(workspace_cleaner, "REPORTS_DIR", dirs["reports"])
    monkeypatch.setattr(workspace_cleaner, "DIST_DIR", dirs["dist"])
    return dirs


def _make_tree(cleaner_dirs: dict[str, Path]) -> None:
    """构造含已发布/未发布批次与异常目录的假工作区。"""
    # 任务记录：一个正常任务 + 一个命名异常目录
    job = cleaner_dirs["patch_jobs"] / "mount_0003"
    job.mkdir()
    (job / "job.json").write_text("{}", encoding="utf-8")
    (cleaner_dirs["patch_jobs"] / "not-a-job").mkdir()

    # 未发布批次
    unpublished = cleaner_dirs["mpq"] / "20260101_120000"
    unpublished.mkdir()
    (unpublished / "patch-mounts.mpq").write_bytes(b"x" * 100)
    # 已发布批次（dist 中存在 patch-zhCN-*.mpq）
    published = cleaner_dirs["mpq"] / "20260102_130000"
    published.mkdir()
    (published / "patch-mounts.mpq").write_bytes(b"y" * 50)
    dist_batch = cleaner_dirs["dist"] / "20260102_130000"
    dist_batch.mkdir()
    (dist_batch / "patch-zhCN-5.mpq").write_bytes(b"z")
    # 非批次目录
    (cleaner_dirs["mpq"] / "notes.txt").write_text("x", encoding="utf-8")

    # 报告：同批次时间戳 + 非时间戳目录
    report = cleaner_dirs["reports"] / "20260101_120000"
    report.mkdir()
    (report / "validation-report.json").write_text("{}", encoding="utf-8")
    (cleaner_dirs["reports"] / "duplicate-id-report").mkdir()


def test_dry_run_lists_without_deleting(cleaner_dirs: dict[str, Path]) -> None:
    """默认 dry-run：列出目标但不删除。"""
    _make_tree(cleaner_dirs)
    result = clean_workspace()

    assert result["dry_run"] is True
    paths = [t["path"] for t in result["targets"]]
    assert any("mount_0003" in p for p in paths)
    assert any("mpq/20260101_120000" in p for p in paths)
    assert any("reports/20260101_120000" in p for p in paths)
    assert result["total_size_bytes"] > 0

    # 未删除任何内容
    assert (cleaner_dirs["patch_jobs"] / "mount_0003").exists()
    assert (cleaner_dirs["mpq"] / "20260101_120000").exists()
    assert (cleaner_dirs["reports"] / "20260101_120000").exists()


def test_execute_removes_targets_keeps_protected(cleaner_dirs: dict[str, Path]) -> None:
    """执行清理删除目标，保留已发布批次与异常目录。"""
    _make_tree(cleaner_dirs)
    result = clean_workspace(execute=True)

    assert result["dry_run"] is False
    assert result["errors"] == []
    assert not (cleaner_dirs["patch_jobs"] / "mount_0003").exists()
    assert not (cleaner_dirs["mpq"] / "20260101_120000").exists()
    assert not (cleaner_dirs["reports"] / "20260101_120000").exists()

    # 已发布批次与非时间戳目录保留
    assert (cleaner_dirs["mpq"] / "20260102_130000").exists()
    assert (cleaner_dirs["reports"] / "duplicate-id-report").exists()
    assert (cleaner_dirs["patch_jobs"] / "not-a-job").exists()

    skipped = {s["path"]: s["reason"] for s in result["skipped"]}
    assert skipped[str(cleaner_dirs["mpq"] / "20260102_130000")] == "已发布批次"
    assert skipped[str(cleaner_dirs["reports"] / "duplicate-id-report")] == "非批次目录"
    assert skipped[str(cleaner_dirs["patch_jobs"] / "not-a-job")] == "非任务目录"

    # dist 永不在目标内
    assert all("dist" not in Path(t["path"]).parts for t in result["targets"])


def test_include_published_cleans_published_batch(cleaner_dirs: dict[str, Path]) -> None:
    """include_published=True 时已发布批次纳入清理。"""
    _make_tree(cleaner_dirs)
    clean_workspace(execute=True, include_published=True)

    assert not (cleaner_dirs["mpq"] / "20260102_130000").exists()
    # dist 中的发布产物仍然保留
    assert (cleaner_dirs["dist"] / "20260102_130000" / "patch-zhCN-5.mpq").exists()


def test_older_than_filters_recent_dirs(cleaner_dirs: dict[str, Path]) -> None:
    """older_than_days 过滤近期目录，仅清理更早的。"""
    _make_tree(cleaner_dirs)
    old_dir = cleaner_dirs["mpq"] / "20260101_120000"
    old_time = time.time() - 10 * 86400
    os.utime(old_dir, (old_time, old_time))

    result = clean_workspace(older_than_days=7)
    paths = [t["path"] for t in result["targets"]]
    assert any("20260101_120000" in p for p in paths)  # 10 天前 → 清理
    assert not any("mount_0003" in p for p in paths)  # 刚创建 → 未到期

    skipped = [s["reason"] for s in result["skipped"]]
    assert "未到期" in skipped


def test_clean_refused_while_building(
    cleaner_dirs: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """构建运行中拒绝清理。"""
    monkeypatch.setattr(
        "app.services.workspace_cleaner.get_build_status", lambda: {"running": True}
    )
    with pytest.raises(WorkspaceCleanerError):
        clean_workspace()


def test_clean_empty_workspace(cleaner_dirs: dict[str, Path]) -> None:
    """空工作区返回空结果而非报错。"""
    result = clean_workspace()
    assert result["targets"] == []
    assert result["total_size_bytes"] == 0
