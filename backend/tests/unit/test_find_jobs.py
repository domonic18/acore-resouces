"""find_jobs 的任务范围判定单元测试。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.mount_patch_builder import find_jobs

# 真实存在的坐骑资源 ID（build_job_context 要按 ID 回读 YAML 真相源）
RESOURCE_IDS = (3, 4, 11, 46)


def _write_job(jobs_dir: Path, resource_id: int, status: str) -> str:
    job_id = f"mount_{resource_id:04d}"
    job_dir = jobs_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "job.json").write_text(
        json.dumps(
            {
                "job_id": job_id,
                "resource_type": "mount",
                "resource_id": resource_id,
                "resource_name": "测试坐骑",
                "resource_model_folder": "TestMount",
                "status": status,
                "artifacts": {"output": {}},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return job_id


@pytest.fixture
def jobs_dir(tmp_path: Path) -> Path:
    path = tmp_path / "patch-jobs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_explicit_job_ids_ignore_status(jobs_dir: Path) -> None:
    """显式指定任务时不过滤状态——已发布的任务也允许重建。

    用户点名要构建哪个任务就是覆盖意图；若这里仍按状态过滤，
    「重新生成已发布坐骑的补丁」会直接报「没有可处理的任务」。
    """
    applied = _write_job(jobs_dir, RESOURCE_IDS[0], "applied")
    requested = _write_job(jobs_dir, RESOURCE_IDS[1], "requested")

    contexts, _ = find_jobs(jobs_dir, False, [applied, requested])
    assert {ctx.job_id for ctx in contexts} == {applied, requested}


def test_all_requested_excludes_applied(jobs_dir: Path) -> None:
    """构建全部时排除已发布任务，避免每次都把已发布批次重做一遍。"""
    _write_job(jobs_dir, RESOURCE_IDS[0], "applied")
    requested = _write_job(jobs_dir, RESOURCE_IDS[1], "requested")
    generated = _write_job(jobs_dir, RESOURCE_IDS[2], "generated")
    failed = _write_job(jobs_dir, RESOURCE_IDS[3], "failed")

    contexts, rebuild = find_jobs(jobs_dir, True, None)
    assert {ctx.job_id for ctx in contexts} == {requested, generated, failed}
    assert rebuild == {generated}
