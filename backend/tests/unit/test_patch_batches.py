"""补丁批次聚合查询单元测试。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.core.config import Settings
from app.services import patch_batches

BATCH_TS = "20260906_011935"
MPQ_REL = f"workspace/mpq/{BATCH_TS}/patch-mounts.mpq"


@pytest.fixture
def batch_dirs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """将 patch-jobs / mpq / reports 目录指向临时目录。"""
    jobs_dir = tmp_path / "patch-jobs"
    jobs_dir.mkdir(parents=True, exist_ok=True)

    def _patch_settings() -> Settings:
        s = Settings()
        s.patch_jobs_dir = jobs_dir
        return s

    monkeypatch.setattr("app.services.patch_batches.settings", _patch_settings())
    monkeypatch.setattr(patch_batches, "MPQ_OUTPUT_DIR", tmp_path / "mpq")
    monkeypatch.setattr(patch_batches, "REPORTS_DIR", tmp_path / "reports")
    return jobs_dir


def _write_job(
    jobs_dir: Path,
    job_id: str,
    status: str = "generated",
    mpq: str | None = MPQ_REL,
    sql_files: list[str] | None = None,
) -> Path:
    """写入一个真实形状的 job.json（builder 裸写、绕过 Pydantic 校验）。"""
    job_dir = jobs_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    output: dict[str, Any] = {
        "dbc_dir": "data/wow-dbc/src/dbc",
        "sql_files": sql_files or [],
    }
    if mpq:
        output["mpq"] = mpq
        output["validation_report"] = f"workspace/reports/{BATCH_TS}/validation-report.json"
        output["audit"] = f"workspace/reports/{BATCH_TS}/audit-report.json"
    data = {
        "job_id": job_id,
        "created_at": "2026-09-06T00:00:00+00:00",
        "created_by": "system",
        "resource_type": "mount",
        "resource_id": int(job_id.split("_")[1]),
        "resource_name": f"坐骑{job_id.split('_')[1]}",
        "resource_model_folder": "test",
        "status": status,
        "completed_at": "2026-09-06T01:00:00+00:00",
        "artifacts": {"output": output},
    }
    (job_dir / "job.json").write_text(json.dumps(data), encoding="utf-8")
    return job_dir


def _write_batch_artifacts() -> None:
    """在临时 mpq/reports 目录落盘 manifest 与审计报告。"""
    mpq_dir = patch_batches.MPQ_OUTPUT_DIR / BATCH_TS
    reports_dir = patch_batches.REPORTS_DIR / BATCH_TS
    mpq_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    (mpq_dir / "manifest.json").write_text(
        json.dumps({"batch": BATCH_TS, "generated_at": "2026-09-06T01:05:00+00:00"}),
        encoding="utf-8",
    )
    audit = {
        "batch": BATCH_TS,
        "generated_at": "2026-09-06T01:05:00+00:00",
        "jobs": [],
        "dbc": [
            {"job_id": "mount_0003", "dbc_file": "Spell.dbc", "record_id": 900001},
            {"job_id": "mount_0003", "dbc_file": "Spell.dbc", "record_id": 900002},
            {"job_id": "mount_0003", "dbc_file": "Item.dbc", "record_id": 700001},
            {"job_id": "mount_0005", "dbc_file": "Spell.dbc", "record_id": 900003},
        ],
        "sql": [
            {
                "job_id": "mount_0003",
                "output_sql_file": "data/sql/a.sql",
                "status": "written",
                "tables": [
                    {"name": "creature_template", "operation": "insert", "records": [{"entry": 1}]},
                    {"name": "item_template", "operation": "insert", "records": [{"entry": 2}]},
                ],
            },
            {
                "job_id": "mount_0005",
                "output_sql_file": "data/sql/b.sql",
                "status": "written",
                "tables": [
                    {"name": "creature_template", "operation": "insert", "records": [{"entry": 3}]},
                ],
            },
        ],
        "mpq": {},
    }
    (reports_dir / "audit-report.json").write_text(
        json.dumps(audit), encoding="utf-8"
    )


def test_groups_jobs_by_mpq_batch(batch_dirs: Path) -> None:
    """同批次 job 聚合为一组，pending job 单独成组。"""
    _write_job(batch_dirs, "mount_0003", sql_files=["data/sql/a.sql"])
    _write_job(batch_dirs, "mount_0005", sql_files=["data/sql/b.sql"])
    _write_job(batch_dirs, "mount_0009", status="requested", mpq=None)
    _write_batch_artifacts()

    batches = patch_batches.list_patch_batches()
    assert len(batches) == 2
    by_id = {b.batch_id: b for b in batches}
    assert set(by_id) == {BATCH_TS, "pending"}

    real = by_id[BATCH_TS]
    assert real.job_count == 2
    assert real.status == "generated"
    # created_at 优先取 mpq manifest 的 generated_at
    assert real.created_at == "2026-09-06T01:05:00+00:00"
    # sql_files 并集去重
    assert real.output["sql_files"] == ["data/sql/a.sql", "data/sql/b.sql"]
    assert real.output["mpq"] == MPQ_REL
    assert real.output["manifest"] == f"workspace/mpq/{BATCH_TS}/manifest.json"
    assert real.output["changelog"] == f"workspace/mpq/{BATCH_TS}/changelog.md"

    pending = by_id["pending"]
    assert pending.job_count == 1
    assert pending.status == "requested"
    assert pending.output.get("mpq") is None
    assert pending.jobs[0].audit is None


def test_job_audit_summaries(batch_dirs: Path) -> None:
    """per-job 审计摘要按 dbc 文件聚合计数、sql 表带记录数。"""
    _write_job(batch_dirs, "mount_0003")
    _write_job(batch_dirs, "mount_0005")
    _write_batch_artifacts()

    batches = patch_batches.list_patch_batches()
    real = next(b for b in batches if b.batch_id == BATCH_TS)
    by_job = {j.job_id: j for j in real.jobs}

    a3 = by_job["mount_0003"].audit
    assert a3 is not None
    assert {f["dbc_file"]: f["record_count"] for f in a3.dbc_files} == {
        "Item.dbc": 1,
        "Spell.dbc": 2,
    }
    assert a3.sql_file == "data/sql/a.sql"
    assert {t["name"]: t["record_count"] for t in a3.sql_tables} == {
        "creature_template": 1,
        "item_template": 1,
    }

    a5 = by_job["mount_0005"].audit
    assert a5 is not None
    assert [f["dbc_file"] for f in a5.dbc_files] == ["Spell.dbc"]
    assert a5.sql_file == "data/sql/b.sql"


def test_status_filter_and_failed_priority(batch_dirs: Path) -> None:
    """状态过滤生效；批次内任一 failed 则聚合状态为 failed。"""
    _write_job(batch_dirs, "mount_0003", status="generated")
    _write_job(batch_dirs, "mount_0005", status="failed")
    _write_job(batch_dirs, "mount_0009", status="requested", mpq=None)

    failed = patch_batches.list_patch_batches(status="failed")
    assert len(failed) == 1
    assert failed[0].batch_id == BATCH_TS

    requested = patch_batches.list_patch_batches(status="requested")
    assert [b.batch_id for b in requested] == ["pending"]

    generated = patch_batches.list_patch_batches(status="generated")
    assert generated == []


def test_sort_by_created_at_desc(batch_dirs: Path) -> None:
    """批次按创建时间倒序，新批次在前。"""
    _write_job(batch_dirs, "mount_0003", sql_files=["data/sql/a.sql"])
    _write_batch_artifacts()
    _write_job(batch_dirs, "mount_0009", status="requested", mpq=None)
    # pending 组 created_at 更晚 → 应排在真实批次之前
    newer = batch_dirs / "mount_0009" / "job.json"
    data = json.loads(newer.read_text(encoding="utf-8"))
    data["created_at"] = "2026-09-09T00:00:00+00:00"
    newer.write_text(json.dumps(data), encoding="utf-8")

    batches = patch_batches.list_patch_batches()
    assert [b.batch_id for b in batches] == ["pending", BATCH_TS]
