"""构建运行器单元测试。"""

from __future__ import annotations

import pytest

from app.services import build_runner
from app.services.mount_patch_builder import DBCConflictError


@pytest.fixture(autouse=True)
def _reset_status():
    """每个用例前后重置运行器状态，并保证锁不处于持有状态。"""

    def _reset() -> None:
        build_runner._status.update(
            running=False,
            started_at=None,
            finished_at=None,
            result=None,
            error=None,
        )
        build_runner._log_buffer.clear()
        build_runner._progress.update(current=0, total=0, current_job=None)

    _reset()
    yield
    _reset()
    try:
        build_runner._lock.release()
    except RuntimeError:
        pass


def test_start_build_lock_mutex():
    build_runner.start_build(True, None, False, False)
    with pytest.raises(build_runner.BuildAlreadyRunningError):
        build_runner.start_build(True, None, False, False)
    status = build_runner.get_build_status()
    assert status["running"] is True
    assert status["started_at"] is not None


def test_run_build_success(monkeypatch):
    def fake_build(**kwargs):
        return {
            "jobs": ["job-1"],
            "sql_files": [],
            "mpq_path": "/tmp/patch.mpq",
            "report_path": "/tmp/report.md",
            "audit_path": "/tmp/audit-report.json",
            "manifest_path": "/tmp/manifest.json",
            "dry_run": False,
        }

    monkeypatch.setattr(build_runner, "build_mount_patches", fake_build)
    build_runner.start_build(True, None, False, False)
    build_runner.run_build(True, None, False, False)

    status = build_runner.get_build_status()
    assert status["running"] is False
    assert status["error"] is None
    assert status["finished_at"] is not None
    assert status["result"]["jobs"] == ["job-1"]
    assert status["result"]["mpq_path"] == "/tmp/patch.mpq"
    assert status["result"]["audit_path"] == "/tmp/audit-report.json"
    assert status["result"]["manifest_path"] == "/tmp/manifest.json"


def test_run_build_dbc_conflict(monkeypatch):
    def fake_build(**kwargs):
        raise DBCConflictError("Spell.dbc#80000 已存在")

    monkeypatch.setattr(build_runner, "build_mount_patches", fake_build)
    build_runner.start_build(True, None, False, False)
    build_runner.run_build(True, None, False, False)

    status = build_runner.get_build_status()
    assert status["running"] is False
    assert status["result"] is None
    assert "冲突" in status["error"]
    # 异常结束后锁必须已释放，可再次启动
    build_runner.start_build(True, None, False, False)


def test_run_build_unexpected_error_releases_lock(monkeypatch):
    def fake_build(**kwargs):
        raise ValueError("意外错误")

    monkeypatch.setattr(build_runner, "build_mount_patches", fake_build)
    build_runner.start_build(True, None, False, False)
    build_runner.run_build(True, None, False, False)

    status = build_runner.get_build_status()
    assert status["running"] is False
    assert "意外错误" in status["error"]
    build_runner.start_build(True, None, False, False)


def test_status_shape_includes_log_and_progress():
    status = build_runner.get_build_status()
    assert {
        "running",
        "started_at",
        "finished_at",
        "result",
        "error",
        "log",
        "progress",
    } <= set(status)
    assert status["log"] == []
    assert status["progress"] == {"current": 0, "total": 0, "current_job": None}


def test_log_buffer_captured_and_cleared(monkeypatch):
    def fake_build(**kwargs):
        log = kwargs["log"]
        progress = kwargs["progress"]
        log("将处理 2 个任务：")
        progress(0, 2, None)
        log("  - job-1")
        progress(1, 2, "job-1")
        log("  - job-2")
        progress(2, 2, "job-2")
        return {
            "jobs": ["job-1", "job-2"],
            "sql_files": [],
            "mpq_path": "/tmp/patch.mpq",
            "report_path": "/tmp/report.md",
            "audit_path": "/tmp/audit-report.json",
            "manifest_path": "/tmp/manifest.json",
            "dry_run": False,
        }

    monkeypatch.setattr(build_runner, "build_mount_patches", fake_build)
    build_runner.start_build(True, None, False, False)
    build_runner.run_build(True, None, False, False)

    status = build_runner.get_build_status()
    messages = [entry["message"] for entry in status["log"]]
    assert "将处理 2 个任务：" in messages
    assert "  - job-1" in messages
    assert "构建完成。" in messages
    assert all("ts" in entry for entry in status["log"])
    assert status["progress"] == {"current": 2, "total": 2, "current_job": "job-2"}

    # 再次启动时缓冲被清空
    build_runner.start_build(True, None, False, False)
    fresh = build_runner.get_build_status()
    assert fresh["log"] == []
    assert fresh["progress"] == {"current": 0, "total": 0, "current_job": None}


def test_error_appended_to_log(monkeypatch):
    def fake_build(**kwargs):
        raise DBCConflictError("Spell.dbc#80000 已存在")

    monkeypatch.setattr(build_runner, "build_mount_patches", fake_build)
    build_runner.start_build(True, None, False, False)
    build_runner.run_build(True, None, False, False)

    status = build_runner.get_build_status()
    assert any("冲突" in entry["message"] for entry in status["log"])
    build_runner.start_build(True, None, False, False)
