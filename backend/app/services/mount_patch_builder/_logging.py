"""构建进度日志与回调注册。

构建过程同时向 stdout（CLI 行为）与可选回调（web 构建日志/进度条）
输出进度；回调状态是包级全局，由 build_mount_patches 在构建开始时注册、
结束时清空。
"""

from __future__ import annotations

from collections.abc import Callable

_active_log: Callable[[str], None] | None = None
_active_progress: Callable[[int, int, str | None], None] | None = None
_active_phase: Callable[[str], None] | None = None


def set_callbacks(
    log: Callable[[str], None] | None,
    progress: Callable[[int, int, str | None], None] | None,
    phase: Callable[[str], None] | None,
) -> None:
    """注册本次构建的日志 / 进度 / 阶段回调（仅构建入口调用）。"""
    global _active_log, _active_progress, _active_phase
    _active_log, _active_progress, _active_phase = log, progress, phase


def reset_callbacks() -> None:
    """构建结束后清空回调，避免持有外部引用。"""
    global _active_log, _active_progress, _active_phase
    _active_log = None
    _active_progress = None
    _active_phase = None


def _log(msg: str = "") -> None:
    """构建进度输出：CLI 保持 print 行为，同时转发给回调（如 web 构建日志）。"""
    print(msg)
    if _active_log is not None:
        _active_log(msg)


def _progress(current: int, total: int, job_id: str | None = None) -> None:
    """上报构建进度（当前序号 / 总数 / 当前任务 ID）。"""
    if _active_progress is not None:
        _active_progress(current, total, job_id)


def _phase(name: str) -> None:
    """上报当前构建阶段。

    与 progress 回调分开：progress 描述「第几个任务」，phase 描述
    「整体处于哪个阶段」（读计划 → 应用 DBC → 生成 SQL → 打包 MPQ …）。
    """
    if _active_phase is not None:
        _active_phase(name)
