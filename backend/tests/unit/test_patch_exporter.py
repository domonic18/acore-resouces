"""补丁任务删除与 manifest 解析单元测试。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.core.config import Settings
from app.schemas.patch import PatchJobManifest
from app.services import patch_exporter
from app.services.build_runner import BuildAlreadyRunningError


@pytest.fixture
def patch_jobs_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """将 patch_jobs_dir 指向临时目录。"""
    jobs_dir = tmp_path / "patch-jobs"
    jobs_dir.mkdir(parents=True, exist_ok=True)

    def _patch_settings() -> Settings:
        s = Settings()
        s.patch_jobs_dir = jobs_dir
        return s

    monkeypatch.setattr("app.services.patch_exporter.settings", _patch_settings())
    return jobs_dir


def _write_job(jobs_dir: Path, job_id: str, output: dict[str, Any] | None = None) -> Path:
    """写入一个真实形状的 job.json（builder 裸写、绕过 Pydantic 校验）。"""
    job_dir = jobs_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    data = {
        "job_id": job_id,
        "created_at": "2026-09-06T00:00:00+00:00",
        "created_by": "system",
        "resource_type": "mount",
        "resource_id": int(job_id.split("_")[1]),
        "resource_name": "测试坐骑",
        "resource_model_folder": "test",
        "status": "generated",
        "artifacts": {"output": output or {}},
        "summary": "处理 1 个坐骑",
    }
    (job_dir / "job.json").write_text(json.dumps(data), encoding="utf-8")
    return job_dir


def test_manifest_parses_list_valued_output() -> None:
    """真实 job.json 的 sql_files 是列表，manifest 必须可解析。"""
    data = {
        "job_id": "mount_0003",
        "created_at": "2026-09-06T00:00:00+00:00",
        "created_by": "system",
        "resource_type": "mount",
        "resource_id": 3,
        "resource_name": "test",
        "resource_model_folder": "test",
        "status": "generated",
        "artifacts": {
            "output": {
                "dbc_dir": "data/wow-dbc/src/dbc",
                "sql_files": ["data/sql/a.sql", "data/sql/b.sql"],
                "mpq": "workspace/mpq/20260906_011935/patch-mounts.mpq",
            }
        },
    }
    manifest = PatchJobManifest(**data)
    assert manifest.artifacts.output["sql_files"] == ["data/sql/a.sql", "data/sql/b.sql"]


def test_load_manifest_reads_real_shaped_job(patch_jobs_dir: Path) -> None:
    """带列表值 output 的 job.json 能被 _load_manifest_file 读出。"""
    _write_job(
        patch_jobs_dir,
        "mount_0003",
        output={"sql_files": ["a.sql"], "mpq": "workspace/mpq/x/patch-mounts.mpq"},
    )
    manifest = patch_exporter.get_patch_job("mount_0003")
    assert manifest is not None
    assert manifest.status == "generated"


@pytest.mark.parametrize(
    "job_id",
    ["..", "../evil", "a_b", "mount_1", "Mount_0001", "mount_0001/..", "/etc", ""],
)
def test_delete_patch_job_rejects_invalid_id(job_id: str, patch_jobs_dir: Path) -> None:
    """非法 job_id（路径穿越 / 命名不符）拒绝删除。"""
    with pytest.raises(ValueError):
        patch_exporter.delete_patch_job(job_id)


def test_delete_patch_job_not_found(patch_jobs_dir: Path) -> None:
    """合法命名但不存在的任务返回 False。"""
    assert patch_exporter.delete_patch_job("mount_9999") is False


def test_delete_patch_job_removes_dir(patch_jobs_dir: Path) -> None:
    """删除任务目录（含遗留 plans/ 子目录）。"""
    job_dir = _write_job(patch_jobs_dir, "mount_0003")
    (job_dir / "plans").mkdir()
    (job_dir / "plans" / "dbc-plan.yaml").write_text("plans: []", encoding="utf-8")

    assert patch_exporter.delete_patch_job("mount_0003") is True
    assert not job_dir.exists()


def test_delete_patch_job_refused_while_building(
    patch_jobs_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """构建运行中拒绝删除。"""
    _write_job(patch_jobs_dir, "mount_0003")
    monkeypatch.setattr("app.services.patch_exporter.get_build_status", lambda: {"running": True})

    with pytest.raises(BuildAlreadyRunningError):
        patch_exporter.delete_patch_job("mount_0003")


def test_create_patch_job_preserves_existing_state(monkeypatch, tmp_path):
    """对已构建的任务再次创建任务，不得清空状态与产物登记。

    早期实现无条件 rmtree 任务目录，导致已构建坐骑的 status 从 generated
    退回 requested、artifacts 里的产物路径丢失——审查步骤再也读不到校验报告。
    """
    from app.core.config import Settings
    from app.services.patch_exporter import create_patch_job, get_patch_job

    jobs_dir = tmp_path / "patch-jobs"
    jobs_dir.mkdir(parents=True, exist_ok=True)

    def _patch_settings() -> Settings:
        s = Settings()
        s.patch_jobs_dir = jobs_dir
        return s

    monkeypatch.setattr("app.services.patch_exporter.settings", _patch_settings())

    # 先创建一个任务
    create_patch_job("mount", 3)
    job_id = "mount_0003"

    # 模拟构建完成：写入 status 与产物登记
    job_path = jobs_dir / job_id / "job.json"
    manifest = json.loads(job_path.read_text(encoding="utf-8"))
    manifest["status"] = "generated"
    manifest["artifacts"] = {
        "output": {
            "dbc_dir": "data/wow-dbc/src/dbc",
            "sql_files": ["data/sql/x/0003_mount_add.sql"],
            "mpq": "workspace/mpq/20260101_000000/patch-mounts.mpq",
            "validation_report": "workspace/reports/20260101_000000/validation-report.json",
            "audit": "workspace/reports/20260101_000000/audit-report.json",
        }
    }
    job_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

    # 再次创建
    create_patch_job("mount", 3)

    after = get_patch_job(job_id)
    assert after is not None
    assert after.status == "generated"
    assert after.artifacts.output.get("validation_report") == (
        "workspace/reports/20260101_000000/validation-report.json"
    )
    assert after.artifacts.output.get("mpq") == (
        "workspace/mpq/20260101_000000/patch-mounts.mpq"
    )


def test_create_patch_job_creates_fresh_task(monkeypatch, tmp_path):
    """全新任务：status 为 requested，产物登记为空。"""
    from app.core.config import Settings
    from app.services.patch_exporter import create_patch_job, get_patch_job

    jobs_dir = tmp_path / "patch-jobs"
    jobs_dir.mkdir(parents=True, exist_ok=True)

    def _patch_settings() -> Settings:
        s = Settings()
        s.patch_jobs_dir = jobs_dir
        return s

    monkeypatch.setattr("app.services.patch_exporter.settings", _patch_settings())

    create_patch_job("mount", 7)
    manifest = get_patch_job("mount_0007")
    assert manifest is not None
    assert manifest.status == "requested"
    assert manifest.artifacts.output == {}
