"""补丁审计服务单元测试。"""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path

import pytest

from app.core.config import Settings
from app.schemas.resource import Mount
from app.services import patch_audit


@dataclasses.dataclass
class _StubCtx:
    """write_audit_report 只读取 job_id 与 resource 展示字段的替身。"""

    job_id: str
    resource: Mount


@pytest.fixture
def audit_dirs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """把审计服务的报告/MPQ/任务目录与 settings 指向临时目录。"""
    reports = tmp_path / "reports"
    mpq = tmp_path / "mpq"
    reports.mkdir()
    mpq.mkdir()
    monkeypatch.setattr(patch_audit, "REPORTS_DIR", reports)
    monkeypatch.setattr(patch_audit, "MPQ_OUTPUT_DIR", mpq)

    patched = Settings()
    patched.project_root = tmp_path
    patched.patch_jobs_dir = tmp_path / "patch-jobs"
    monkeypatch.setattr(patch_audit, "settings", patched)
    return tmp_path


def _stub_mount(name: str = "审计测试") -> Mount:
    return Mount(
        id=3,
        model_folder="audit_test_mount",
        official_db={"name": name},
        dbc={
            "creature_model_data": {"id": 4000, "model_name": "test.m2"},
            "creature_display_info": {"id": 140000, "model_id": 4000},
            "spell": {"id": 80000, "name": name},
            "item": {"id": 91000, "class": 15, "subclass": 5},
        },
        db={"creature_template": {"entry": 9140000}},
        mount_type="陆地坐骑",
    )


def _sample_manifest() -> dict:
    return {
        "batch": "20260101_120000",
        "mpq": "patch-mounts.mpq",
        "obfuscation": "none",
        "files": [
            {"path": "DBFilesClient/Spell.dbc", "size_bytes": 10, "sha256": "aaa", "kind": "dbc"},
            {"path": "creature/x/x.m2", "size_bytes": 20, "sha256": "bbb", "kind": "asset"},
        ],
    }


def _write_report_file(audit_dirs: Path, batch: str, data: dict) -> Path:
    report_dir = audit_dirs / "reports" / batch
    report_dir.mkdir(parents=True, exist_ok=True)
    path = report_dir / "audit-report.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def test_write_audit_report_shape(audit_dirs: Path) -> None:
    """报告落盘且结构完整：jobs/dbc/sql/mpq 汇总。"""
    ctxs = [_StubCtx("mount_0003", _stub_mount())]
    manifest = _sample_manifest()
    dbc_records = [
        {
            "dbc_file": "Spell.dbc",
            "record_id": 80000,
            "job_id": "mount_0003",
            "action": "add",
            "action_taken": "added",
            "before": None,
            "after": {"Name_Lang_deDE": "审计测试"},
        }
    ]
    sql_entries = [
        {
            "job_id": "mount_0003",
            "output_sql_file": "data/sql/mounts/0003_x/0003_mount_add.sql",
            "status": "written",
            "tables": [{"name": "item_template", "operation": "insert", "records": [{"entry": 91000}]}],
        }
    ]

    path = patch_audit.write_audit_report(ctxs, dbc_records, sql_entries, manifest, "20260101_120000")

    assert path == audit_dirs / "reports" / "20260101_120000" / "audit-report.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["batch"] == "20260101_120000"
    assert data["job_ids"] == ["mount_0003"]
    assert data["jobs"][0]["resource_name"] == "审计测试"
    assert data["jobs"][0]["model_folder"] == "audit_test_mount"
    assert data["dbc"] == dbc_records
    assert data["sql"] == sql_entries
    assert data["mpq"]["file_count"] == 2
    assert data["mpq"]["counts_by_kind"] == {"dbc": 1, "asset": 1}
    # 无更早批次 manifest → diff 为 None
    assert data["mpq"]["diff"] is None


def test_write_audit_report_dry_run_no_write(audit_dirs: Path) -> None:
    """dry_run 只返回路径不落盘。"""
    path = patch_audit.write_audit_report(
        [], [], [], _sample_manifest(), "20260101_120000", dry_run=True
    )
    assert not path.exists()


def test_write_audit_report_diff_vs_previous_batch(audit_dirs: Path) -> None:
    """与前批 manifest 按 path+sha256 对比，分 added/replaced/unchanged。"""
    prev_dir = audit_dirs / "mpq" / "20251231_235959"
    prev_dir.mkdir()
    (prev_dir / "manifest.json").write_text(
        json.dumps(
            {
                "batch": "20251231_235959",
                "files": [
                    {"path": "DBFilesClient/Spell.dbc", "sha256": "aaa", "kind": "dbc"},
                    {"path": "DBFilesClient/Item.dbc", "sha256": "zzz", "kind": "dbc"},
                ],
            }
        ),
        encoding="utf-8",
    )
    # 更早但没有 manifest 的批次不参与对比
    (audit_dirs / "mpq" / "20251230_000000").mkdir()

    manifest = {
        **_sample_manifest(),
        "files": [
            {"path": "DBFilesClient/Spell.dbc", "size_bytes": 10, "sha256": "aaa", "kind": "dbc"},
            {"path": "DBFilesClient/Item.dbc", "size_bytes": 30, "sha256": "ccc", "kind": "dbc"},
            {"path": "creature/x/x.m2", "size_bytes": 20, "sha256": "bbb", "kind": "asset"},
        ],
    }
    path = patch_audit.write_audit_report(
        [_StubCtx("mount_0003", _stub_mount())], [], [], manifest, "20260101_120000"
    )
    data = json.loads(path.read_text(encoding="utf-8"))
    diff = data["mpq"]["diff"]
    assert diff == {
        "added": ["creature/x/x.m2"],
        "replaced": ["DBFilesClient/Item.dbc"],
        "unchanged": ["DBFilesClient/Spell.dbc"],
    }


def _batch_report() -> dict:
    return {
        "generated_at": "2026-01-01T12:00:00+00:00",
        "batch": "20260101_120000",
        "job_ids": ["mount_0003", "mount_0101"],
        "jobs": [
            {"job_id": "mount_0003", "resource_name": "审计测试", "model_folder": "audit_test_mount"},
            {"job_id": "mount_0101", "resource_name": "石牙斗猪", "model_folder": "stone_tusk"},
        ],
        "dbc": [
            {"dbc_file": "Spell.dbc", "record_id": 80000, "job_id": "mount_0003",
             "action": "add", "action_taken": "added", "before": None, "after": {"ID": 80000}},
            {"dbc_file": "Spell.dbc", "record_id": 80101, "job_id": "mount_0101",
             "action": "add", "action_taken": "added", "before": None, "after": {"ID": 80101}},
        ],
        "sql": [
            {"job_id": "mount_0003", "output_sql_file": "a.sql", "status": "written",
             "tables": [{"name": "item_template", "operation": "insert", "records": [{"entry": 91000}]}]},
            {"job_id": "mount_0101", "output_sql_file": "b.sql", "status": "already_exists", "tables": []},
        ],
        "mpq": {
            "batch": "20260101_120000",
            "path": "patch-mounts.mpq",
            "obfuscation": "none",
            "file_count": 2,
            "counts_by_kind": {"dbc": 1, "asset": 1},
            "files": [{"path": "DBFilesClient/Spell.dbc", "size_bytes": 10, "sha256": "aaa", "kind": "dbc"}],
            "diff": None,
        },
    }


def _write_job(audit_dirs: Path, job_id: str, *, with_audit: bool = True) -> Path:
    job_dir = audit_dirs / "patch-jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    output: dict = {"sql_files": ["data/sql/a.sql"]}  # 列表值：裸读不经 Pydantic
    if with_audit:
        output["audit"] = "reports/20260101_120000/audit-report.json"
    manifest = {
        "job_id": job_id,
        "resource_type": "mount",
        "resource_id": 3,
        "resource_name": "审计测试",
        "resource_model_folder": "audit_test_mount",
        "status": "generated",
        "artifacts": {"output": output},
    }
    (job_dir / "job.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    return job_dir


def test_load_audit_by_job_filters_entries(audit_dirs: Path) -> None:
    """按任务过滤 dbc/sql 条目，mpq 保留批次级摘要。"""
    _write_report_file(audit_dirs, "20260101_120000", _batch_report())
    _write_job(audit_dirs, "mount_0003")

    result = patch_audit.load_audit_by_job("mount_0003")

    assert result["job_id"] == "mount_0003"
    assert result["resource_name"] == "审计测试"
    assert result["model_folder"] == "audit_test_mount"
    assert result["report"]["batch"] == "20260101_120000"
    assert [e["record_id"] for e in result["dbc"]] == [80000]
    assert result["sql"]["output_sql_file"] == "a.sql"
    assert result["sql"]["status"] == "written"
    assert result["mpq"]["file_count"] == 2


def test_load_audit_by_batch(audit_dirs: Path) -> None:
    """按批次时间戳直读完整报告；非法 key 与缺失批次报错。"""
    _write_report_file(audit_dirs, "20260101_120000", _batch_report())

    report = patch_audit.load_audit_by_batch("20260101_120000")
    assert report["batch"] == "20260101_120000"
    assert len(report["dbc"]) == 2

    with pytest.raises(FileNotFoundError):
        patch_audit.load_audit_by_batch("not-a-batch")
    with pytest.raises(FileNotFoundError):
        patch_audit.load_audit_by_batch("20260102_000000")


@pytest.mark.parametrize(
    ("job_id", "with_audit", "write_report", "write_job"),
    [
        ("mount_0003", True, False, True),  # 报告文件缺失
        ("mount_0003", False, True, True),  # 无 audit 路径（旧任务）
        ("mount_9999", True, True, False),  # 任务不存在
        ("../evil", True, True, False),  # 路径穿越
        ("", True, True, False),  # 空 ID
    ],
)
def test_load_audit_by_job_missing_raises(
    audit_dirs: Path, job_id: str, with_audit: bool, write_report: bool, write_job: bool
) -> None:
    """任务缺失 / 无审计路径 / 报告缺失 / 非法 ID 均抛 FileNotFoundError。"""
    if write_report:
        _write_report_file(audit_dirs, "20260101_120000", _batch_report())
    if write_job:
        _write_job(audit_dirs, job_id, with_audit=with_audit)

    with pytest.raises(FileNotFoundError):
        patch_audit.load_audit_by_job(job_id)
