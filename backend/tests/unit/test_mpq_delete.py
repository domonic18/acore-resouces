"""MPQ 档案删除的单元测试。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services import mpq_inspector


@pytest.fixture
def fake_roots(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Path]:
    """把档案根目录指向临时目录，并隔离补丁任务目录。"""
    mpq_root = tmp_path / "workspace" / "mpq"
    dist_root = tmp_path / "workspace" / "dist"
    jobs_dir = tmp_path / "workspace" / "patch-jobs"
    for d in (mpq_root, dist_root, jobs_dir):
        d.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(
        mpq_inspector,
        "ARCHIVE_ROOTS",
        {"mpq": mpq_root, "dist": dist_root},
    )
    monkeypatch.setattr(mpq_inspector, "settings", type("S", (), {
        "patch_jobs_dir": jobs_dir,
        "project_root": tmp_path,
    })())
    return {"mpq": mpq_root, "dist": dist_root, "jobs": jobs_dir}


def _make_batch(root: Path, batch: str, name: str = "patch-zhCN-7.mpq") -> Path:
    batch_dir = root / batch
    batch_dir.mkdir(parents=True, exist_ok=True)
    (batch_dir / name).write_bytes(b"MPQ fake")
    (batch_dir / "manifest.json").write_text(
        json.dumps({"patch_number": 7, "jobs": ["mount_0003"]}), encoding="utf-8"
    )
    (batch_dir / "changelog.md").write_text("# 变更", encoding="utf-8")
    return batch_dir


def test_delete_archive_removes_mpq_keeps_metadata(
    fake_roots: dict[str, Path],
) -> None:
    """删除只移除 MPQ 文件，批次元数据（manifest / changelog）保留供审计。"""
    batch_dir = _make_batch(fake_roots["dist"], "20261121_013605")

    result = mpq_inspector.delete_archive(
        "dist/20261121_013605/patch-zhCN-7.mpq"
    )

    assert result["batch"] == "20261121_013605"
    assert result["source"] == "dist"
    assert result["size_bytes"] > 0
    assert not (batch_dir / "patch-zhCN-7.mpq").exists()
    assert (batch_dir / "manifest.json").exists()
    assert (batch_dir / "changelog.md").exists()


def test_delete_archive_removes_empty_batch_dir(
    fake_roots: dict[str, Path],
) -> None:
    """批次目录只剩空壳时一并清掉，不留空目录。"""
    batch_dir = fake_roots["dist"] / "20260101_000000"
    batch_dir.mkdir(parents=True)
    (batch_dir / "patch-zhCN-1.mpq").write_bytes(b"MPQ")

    mpq_inspector.delete_archive("dist/20260101_000000/patch-zhCN-1.mpq")

    assert not batch_dir.exists()


def test_delete_archive_blocks_path_traversal(fake_roots: dict[str, Path]) -> None:
    """档案路径逃出允许的根目录时必须拒绝。"""
    outside = fake_roots["mpq"].parent.parent / "secret.mpq"
    outside.write_bytes(b"secret")

    with pytest.raises(mpq_inspector.MpqArchiveNotFoundError):
        mpq_inspector.delete_archive("mpq/../../secret.mpq")

    assert outside.exists()


def test_delete_archive_rejects_non_mpq(fake_roots: dict[str, Path]) -> None:
    """非 .mpq 目标不受支持。"""
    (fake_roots["dist"] / "20260101_000000").mkdir(parents=True)
    (fake_roots["dist"] / "20260101_000000" / "readme.txt").write_text("x")

    with pytest.raises(mpq_inspector.MpqArchiveNotFoundError):
        mpq_inspector.delete_archive("dist/20260101_000000/readme.txt")


def test_delete_archive_resets_referencing_jobs(
    fake_roots: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """删除批次后，引用它的补丁任务要退回「待构建」并清掉失效登记。"""
    from app.services import patch_exporter

    _make_batch(fake_roots["dist"], "20261121_013605")

    job_dir = fake_roots["jobs"] / "mount_0003"
    job_dir.mkdir(parents=True)
    (job_dir / "job.json").write_text(
        json.dumps(
            {
                "job_id": "mount_0003",
                "created_at": "2026-01-01T00:00:00+00:00",
                "created_by": "system",
                "resource_type": "mount",
                "resource_id": 3,
                "resource_name": "测试坐骑",
                "resource_model_folder": "TestMount",
                "status": "applied",
                "artifacts": {
                    "output": {
                        "mpq": "workspace/dist/20261121_013605/patch-zhCN-7.mpq",
                        "validation_report": "workspace/reports/x/validation-report.json",
                    }
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(patch_exporter.settings, "patch_jobs_dir", fake_roots["jobs"])

    result = mpq_inspector.delete_archive(
        "dist/20261121_013605/patch-zhCN-7.mpq"
    )

    assert result["reset_jobs"] == ["mount_0003"]

    updated = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    assert updated["status"] == "requested"
    output = updated["artifacts"]["output"]
    assert "mpq" not in output, "指向已删文件的 mpq 登记必须清掉"
    assert output["validation_report"], "其它产物登记不应被动到"
