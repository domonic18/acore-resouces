"""校验报告读取服务的回退逻辑单元测试。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.config import Settings
from app.services import patch_reports


@pytest.fixture
def fake_reports(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """把 reports 目录指向临时目录，并放一个含单个任务的批次报告。"""
    reports_dir = tmp_path / "reports"
    batch_dir = reports_dir / "20260101_000000"
    batch_dir.mkdir(parents=True)
    (batch_dir / "validation-report.json").write_text(
        json.dumps(
            {
                "generated_at": "2026-01-01T00:00:00+00:00",
                "batch_size": 1,
                "job_ids": ["mount_0003"],
                "all_passed": True,
                "jobs": [
                    {
                        "job_id": "mount_0003",
                        "mount_name": "测试坐骑",
                        "passed": True,
                        "checks": [
                            {
                                "name": "spell_id_matches_item_template_spellid_2",
                                "passed": True,
                                "severity": "error",
                                "expected": 1,
                                "actual": 1,
                                "message": "一致",
                            }
                        ],
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(patch_reports, "REPORTS_DIR", reports_dir)
    monkeypatch.setattr(patch_reports, "_batch_index_cache", None)
    monkeypatch.setattr(patch_reports, "_batch_index_stamp", None)
    return reports_dir


def _write_job(jobs_dir: Path, job_id: str, output: dict) -> None:
    job_dir = jobs_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "job.json").write_text(
        json.dumps(
            {
                "job_id": job_id,
                "resource_type": "mount",
                "resource_id": int(job_id.split("_")[1]),
                "status": "requested",
                "artifacts": {"output": output},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def test_find_batch_for_job(fake_reports: Path) -> None:
    assert patch_reports.find_batch_for_job("mount_0003") == "20260101_000000"
    assert patch_reports.find_batch_for_job("mount_9999") is None


def test_report_falls_back_to_batch_when_registration_lost(
    fake_reports: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """任务自身登记丢失时，从批次报告反查该任务的记录。"""
    jobs_dir = tmp_path / "patch-jobs"
    _write_job(jobs_dir, "mount_0003", {})

    def _patch_settings() -> Settings:
        s = Settings()
        s.patch_jobs_dir = jobs_dir
        s.project_root = tmp_path
        return s

    monkeypatch.setattr(patch_reports.settings, "patch_jobs_dir", jobs_dir)

    report = patch_reports.load_validation_report_by_job("mount_0003")
    assert report.batch == "20260101_000000"
    assert len(report.jobs) == 1
    assert report.jobs[0].job_id == "mount_0003"
    assert report.jobs[0].mount_name == "测试坐骑"


def test_report_raises_when_no_report_anywhere(
    fake_reports: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    jobs_dir = tmp_path / "patch-jobs"
    _write_job(jobs_dir, "mount_8888", {})
    monkeypatch.setattr(patch_reports.settings, "patch_jobs_dir", jobs_dir)

    with pytest.raises(FileNotFoundError):
        patch_reports.load_validation_report_by_job("mount_8888")
