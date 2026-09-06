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
