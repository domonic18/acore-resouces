"""任选两批次对比服务单元测试。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.services import patch_audit, patch_compare

BATCH_A = "20261120_100000"
BATCH_B = "20261122_100000"


def _write_audit_report(
    reports_dir: Path,
    batch: str,
    files: list[dict[str, str | None]],
    job_ids: list[str],
) -> None:
    batch_dir = reports_dir / batch
    batch_dir.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "batch": batch,
        "generated_at": "2026-11-24T00:00:00+00:00",
        "job_ids": job_ids,
        "jobs": [
            {"job_id": jid, "resource_name": f"坐骑{jid}", "model_folder": "test"}
            for jid in job_ids
        ],
        "mpq": {"files": files},
    }
    (batch_dir / "audit-report.json").write_text(json.dumps(report), encoding="utf-8")


def _files(*specs: tuple[str, str | None]) -> list[dict[str, str | None]]:
    return [{"path": path, "sha256": sha} for path, sha in specs]


@pytest.fixture
def reports_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """将审计报告目录指向临时目录。"""
    reports = tmp_path / "reports"
    monkeypatch.setattr(patch_audit, "REPORTS_DIR", reports)
    return reports


def test_file_and_job_diff(reports_dir: Path) -> None:
    """文件 added/removed/replaced 与坐骑差集方向正确。"""
    _write_audit_report(
        reports_dir,
        BATCH_A,
        _files(("DBC/Mount.dbc", "aaa"), ("DBC/Spell.dbc", "bbb")),
        ["mount_0001", "mount_0002"],
    )
    _write_audit_report(
        reports_dir,
        BATCH_B,
        _files(
            ("DBC/Mount.dbc", "ccc"), ("DBC/Spell.dbc", "bbb"), ("DBFilesClient/New.dbc", "ddd")
        ),
        ["mount_0002", "mount_0003"],
    )

    result = patch_compare.compare_batches(BATCH_A, BATCH_B)

    assert result.files_added == ["DBFilesClient/New.dbc"]
    # Spell.dbc 两批 sha 相同 → unchanged，无移除
    assert result.files_removed == []
    assert result.files_unchanged_count == 1
    assert [e.path for e in result.files_replaced] == ["DBC/Mount.dbc"]
    assert result.files_replaced[0].sha_base == "aaa"
    assert result.files_replaced[0].sha_against == "ccc"

    assert [j.job_id for j in result.jobs_added] == ["mount_0003"]
    assert [j.job_id for j in result.jobs_removed] == ["mount_0001"]
    assert [j.job_id for j in result.jobs_common] == ["mount_0002"]


def test_removed_direction(reports_dir: Path) -> None:
    """removed = 仅基准批次有的文件。"""
    _write_audit_report(reports_dir, BATCH_A, _files(("DBC/Old.dbc", "xxx")), ["mount_0001"])
    _write_audit_report(reports_dir, BATCH_B, _files(), [])

    result = patch_compare.compare_batches(BATCH_A, BATCH_B)

    assert result.files_removed == ["DBC/Old.dbc"]
    assert result.files_added == []
    assert [j.job_id for j in result.jobs_removed] == ["mount_0001"]
    assert result.jobs_common == []


def test_same_batch_rejected(reports_dir: Path) -> None:
    """同批对比直接拒绝。"""
    _write_audit_report(reports_dir, BATCH_A, _files(), [])
    with pytest.raises(ValueError):
        patch_compare.compare_batches(BATCH_A, BATCH_A)


def test_missing_report_raises(reports_dir: Path) -> None:
    """任一批次缺审计报告时明确报错。"""
    _write_audit_report(reports_dir, BATCH_A, _files(), [])
    with pytest.raises(FileNotFoundError):
        patch_compare.compare_batches(BATCH_A, BATCH_B)
