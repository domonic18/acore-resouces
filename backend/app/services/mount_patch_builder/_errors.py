"""坐骑补丁构建的错误类型。"""

from __future__ import annotations


class MountPatchBuilderError(Exception):
    """坐骑补丁构建过程中的通用错误。"""

    def __init__(self, message: str, job_ids: list[str] | None = None) -> None:
        super().__init__(message)
        # 构建失败时，把本次涉及的任务 ID 带出来，便于调用方把任务标记为 failed
        self.job_ids = job_ids or []


class DBCConflictError(MountPatchBuilderError):
    """检测到 DBC 记录 ID 冲突。"""
