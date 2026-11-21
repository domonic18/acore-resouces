"""补丁产物清单服务。

把 job.json 里记录的产物路径整理成带可下载链接的清单，
供界面展示「产物在哪、能不能点开」。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.schemas.patch import ArtifactEntry, JobArtifactsOut
from app.services.mount_patch_builder import load_json

_SAFE_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_\-]+$")
DIST_DIR = settings.project_root / "workspace" / "dist"


def load_job_artifacts(job_id: str) -> JobArtifactsOut:
    """组装补丁任务的产物清单。

    Args:
        job_id: 补丁任务 ID。

    Returns:
        产物条目列表，每项含路径、是否存在与可下载 URL。

    Raises:
        FileNotFoundError: 任务不存在。
    """
    if not _SAFE_KEY_PATTERN.match(job_id):
        raise FileNotFoundError(f"任务 {job_id} 不存在")
    job_path = settings.patch_jobs_dir / job_id / "job.json"
    if not job_path.exists():
        raise FileNotFoundError(f"任务 {job_id} 不存在")

    manifest = load_json(job_path)
    output = (manifest.get("artifacts") or {}).get("output") or {}
    resource_id = manifest.get("resource_id")

    entries: list[ArtifactEntry] = []

    # 任务被重新创建过时产物登记会丢失（artifacts 为空），
    # 这时回退到批次级的产物清单——产物本身还在磁盘上。
    if not output:
        output = _batch_output_for_job(job_id)

    # job.json 的 sql_files 是批次级列表，这里只取属于本任务的那些
    # （SQL 目录名以资源 ID 前缀命名，如 mounts/0004_CoreHound2/）。
    sql_files = output.get("sql_files") or []
    for sql_file in sql_files:
        path = str(sql_file)
        if isinstance(resource_id, int) and f"/{resource_id:04d}_" not in path:
            continue
        entries.append(_file_entry("sql", "SQL 补丁", path))

    mpq_path = output.get("mpq")
    batch = _batch_of(mpq_path)
    if mpq_path:
        entries.append(_file_entry("mpq", "客户端补丁包", str(mpq_path)))
        if batch:
            dist_mpq = _published_mpq(batch)
            if dist_mpq is not None:
                entries.append(_file_entry("mpq_published", "已发布补丁包", dist_mpq))

    validation_report = output.get("validation_report")
    if validation_report:
        entries.append(_file_entry("validation_report", "校验报告", str(validation_report)))

    audit = output.get("audit")
    if audit:
        entries.append(_file_entry("audit", "审计报告", str(audit)))

    dbc_dir = output.get("dbc_dir")
    if dbc_dir:
        entries.append(
            ArtifactEntry(
                kind="dbc_dir",
                label="DBC 源目录",
                path=str(dbc_dir),
                url=None,
                exists=(settings.project_root / str(dbc_dir)).exists(),
                is_dir=True,
            )
        )

    if batch:
        for name, label in (
            ("manifest.json", "批次清单"),
            ("changelog.md", "变更日志"),
            ("readme.txt", "说明文件"),
        ):
            candidate = settings.project_root / "workspace" / "mpq" / batch / name
            entries.append(
                _file_entry("batch_meta", label, str(candidate.relative_to(settings.project_root)))
            )

    return JobArtifactsOut(job_id=job_id, batch=batch, entries=entries)


def _batch_output_for_job(job_id: str) -> dict[str, Any]:
    """取任务所属批次的产物清单（任务自身登记丢失时的回退）。"""
    from app.services.patch_batches import list_patch_batches
    from app.services.patch_reports import find_batch_for_job

    batch = find_batch_for_job(job_id)
    if batch is None:
        return {}
    for item in list_patch_batches():
        if item.batch_id == batch:
            return dict(item.output)
    return {}


def _file_entry(kind: str, label: str, path: str) -> ArtifactEntry:
    """构造单个产物条目。"""
    absolute = settings.project_root / path
    exists = absolute.exists()
    return ArtifactEntry(
        kind=kind,
        label=label,
        path=path,
        url=_download_url(path) if exists and absolute.is_file() else None,
        exists=exists,
        is_dir=absolute.is_dir(),
        size_bytes=absolute.stat().st_size if exists and absolute.is_file() else None,
    )


def _download_url(relative_path: str) -> str:
    """生成预览/下载用的 API 路径。

    复用 /api/preview/file/ 端点——它已做 project_root 内的路径穿越防护。
    """
    return "/api/preview/file/" + relative_path.lstrip("/")


def _batch_of(mpq_path: Any) -> str | None:
    """从 MPQ 路径推断批次目录名。"""
    if not mpq_path:
        return None
    name = Path(str(mpq_path)).parent.name
    return name if re.match(r"^\d{8}_\d{6}$", name) else None


def _published_mpq(batch: str) -> str | None:
    """查找该批次已发布的补丁包（发布后构建侧目录会被清理）。"""
    dist_dir = DIST_DIR / batch
    if not dist_dir.exists():
        return None
    for mpq in sorted(dist_dir.glob("patch-zhCN-*.mpq")):
        return str(mpq.relative_to(settings.project_root))
    return None
