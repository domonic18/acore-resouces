"""补丁构建后台运行器。

构建（DBC/SQL/MPQ）耗时可达分钟级，HTTP 请求内同步执行不可行；
由 API 层通过 FastAPI BackgroundTasks 调用 run_build 在后台线程执行，
模块级状态供 GET /api/patches/build/status 轮询。

仅适用于单进程 uvicorn 部署（本地桌面场景）。
"""

from __future__ import annotations

import threading
from datetime import UTC, datetime
from typing import Any

from app.services.mount_patch_builder import (
    DBCConflictError,
    MountPatchBuilderError,
    build_mount_patches,
)


class BuildAlreadyRunningError(Exception):
    """已有一个构建任务在执行。"""


_lock = threading.Lock()

_status: dict[str, Any] = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "result": None,
    "error": None,
}


def _now() -> str:
    return datetime.now(UTC).isoformat()


def get_build_status() -> dict[str, Any]:
    """返回当前构建状态快照。"""
    return dict(_status)


def start_build(
    all_requested: bool,
    job_ids: list[str] | None,
    dry_run: bool,
    force: bool,
) -> None:
    """获取构建锁并标记运行中；已有构建在跑时抛 BuildAlreadyRunningError。

    锁在 start_build 获取、由 run_build 的 finally 释放，
    保证请求返回与后台任务真正启动之间的窗口期内无法重复启动。
    """
    if not _lock.acquire(blocking=False):
        raise BuildAlreadyRunningError("已有构建任务在执行中，请稍后再试")
    _status.update(
        running=True,
        started_at=_now(),
        finished_at=None,
        result=None,
        error=None,
    )


def run_build(
    all_requested: bool,
    job_ids: list[str] | None,
    dry_run: bool,
    force: bool,
) -> None:
    """后台执行构建：成功写 result，失败写 error，最终必然释放锁。"""
    try:
        result = build_mount_patches(
            all_requested=all_requested,
            job_ids=job_ids,
            dry_run=dry_run,
            force=force,
        )
        _status["result"] = {
            "jobs": result.get("jobs", []),
            "sql_files": [str(p) for p in result.get("sql_files", [])],
            "mpq_path": str(result.get("mpq_path") or ""),
            "report_path": str(result.get("report_path") or ""),
            "audit_path": str(result.get("audit_path") or ""),
            "manifest_path": str(result.get("manifest_path") or ""),
            "dry_run": result.get("dry_run", False),
        }
    except DBCConflictError as e:
        _status["error"] = f"DBC ID 冲突，构建终止：{e}"
    except MountPatchBuilderError as e:
        _status["error"] = f"构建失败：{e}"
    except Exception as e:  # 兜底：后台任务任何异常都必须释放锁
        _status["error"] = f"构建异常：{e}"
    finally:
        _status["running"] = False
        _status["finished_at"] = _now()
        try:
            _lock.release()
        except RuntimeError:
            pass
