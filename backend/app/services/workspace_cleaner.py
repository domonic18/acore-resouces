"""工作区中间产物清理服务。

清理目标限定为三类白名单目录，真相源与 `workspace/dist/` 永不在范围内：
- `workspace/patch-jobs/{job_id}/`（任务记录，含遗留 plans/ 子目录）
- `workspace/mpq/{batch}/`（未发布的批次构建产物）
- `workspace/reports/{batch}/`（未发布的批次校验报告）

安全约定：
- 默认 dry-run（`execute=False` 只预览不删除）；
- 构建运行中拒绝清理（`build_runner.get_build_status`）；
- 已发布批次（dist 中存在对应产物）默认跳过，需 `include_published=True` 才包含；
- 删除逐目录容错，单个目录失败不中断整体清理。
"""

from __future__ import annotations

import re
import shutil
import time
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.build_runner import get_build_status
from app.services.patch_publisher import is_batch_published

PATCH_JOBS_DIR = settings.patch_jobs_dir
MPQ_DIR = settings.project_root / "workspace" / "mpq"
REPORTS_DIR = settings.project_root / "workspace" / "reports"
DIST_DIR = settings.project_root / "workspace" / "dist"

# 与 patch_exporter 的任务 ID 命名一致：{resource_type}_{id:04d}
JOB_ID_PATTERN = re.compile(r"^[a-z]+_\d{4}$")
# 批次目录名：构建时间戳 YYYYMMDD_HHMMSS
BATCH_DIR_PATTERN = re.compile(r"^\d{8}_\d{6}$")


class WorkspaceCleanerError(Exception):
    """工作区清理过程中的通用错误。"""


def _display_path(path: Path) -> str:
    """优先返回相对项目根的路径，便于与 job.json 产物路径对齐。"""
    try:
        return str(path.relative_to(settings.project_root))
    except ValueError:
        return str(path)


def _dir_size_bytes(path: Path) -> int:
    """累加目录内全部文件大小，容忍遍历期间的并发消失。"""
    total = 0
    try:
        for item in path.rglob("*"):
            try:
                if item.is_file():
                    total += item.stat().st_size
            except OSError:
                continue
    except OSError:
        pass
    return total


def _collect_batch_targets(
    parent: Path,
    older_than_cutoff: float | None,
    include_published: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """收集 mpq/ 或 reports/ 下的批次清理目标与跳过项。"""
    targets: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    if not parent.exists():
        return targets, skipped

    for batch_dir in sorted(parent.iterdir()):
        if not batch_dir.is_dir():
            continue
        if not BATCH_DIR_PATTERN.match(batch_dir.name):
            skipped.append({"path": _display_path(batch_dir), "reason": "非批次目录"})
            continue
        if not include_published and is_batch_published(batch_dir, DIST_DIR):
            skipped.append({"path": _display_path(batch_dir), "reason": "已发布批次"})
            continue
        if older_than_cutoff is not None and batch_dir.stat().st_mtime >= older_than_cutoff:
            skipped.append({"path": _display_path(batch_dir), "reason": "未到期"})
            continue
        targets.append(
            {
                "path": _display_path(batch_dir),
                "size_bytes": _dir_size_bytes(batch_dir),
                "reason": "未发布批次",
            }
        )
    return targets, skipped


def clean_workspace(
    execute: bool = False,
    older_than_days: int | None = None,
    include_published: bool = False,
) -> dict[str, Any]:
    """预览或清理工作区中间产物。

    Args:
        execute: False（默认）仅预览；True 执行删除。
        older_than_days: 仅清理目录 mtime 早于 N 天前的产物。
        include_published: 是否包含已发布批次（默认跳过）。

    Returns:
        包含 dry_run / targets / skipped / total_size_bytes / errors 的字典。

    Raises:
        WorkspaceCleanerError: 构建任务运行中。
    """
    if get_build_status()["running"]:
        raise WorkspaceCleanerError("构建任务运行中，禁止清理工作区")

    cutoff: float | None = None
    if older_than_days is not None:
        cutoff = time.time() - older_than_days * 86400

    targets: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    # 1) 任务记录目录
    if PATCH_JOBS_DIR.exists():
        for job_dir in sorted(PATCH_JOBS_DIR.iterdir()):
            if not job_dir.is_dir():
                continue
            if not JOB_ID_PATTERN.match(job_dir.name):
                skipped.append({"path": _display_path(job_dir), "reason": "非任务目录"})
                continue
            if cutoff is not None and job_dir.stat().st_mtime >= cutoff:
                skipped.append({"path": _display_path(job_dir), "reason": "未到期"})
                continue
            targets.append(
                {
                    "path": _display_path(job_dir),
                    "size_bytes": _dir_size_bytes(job_dir),
                    "reason": "任务记录",
                }
            )

    # 2) 批次产物与报告（已发布批次默认跳过）
    for parent in (REPORTS_DIR, MPQ_DIR):
        batch_targets, batch_skipped = _collect_batch_targets(parent, cutoff, include_published)
        targets.extend(batch_targets)
        skipped.extend(batch_skipped)

    errors: list[dict[str, str]] = []
    if execute:
        for target in targets:
            # 预览返回的是展示路径，删除需还原为绝对路径
            src = Path(target["path"])
            if not src.is_absolute():
                src = settings.project_root / src
            try:
                shutil.rmtree(src)
            except OSError as e:
                errors.append({"path": target["path"], "error": str(e)})

    return {
        "dry_run": not execute,
        "targets": targets,
        "skipped": skipped,
        "total_size_bytes": sum(t["size_bytes"] for t in targets),
        "errors": errors,
    }
