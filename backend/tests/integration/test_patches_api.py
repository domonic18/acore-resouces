"""补丁任务 API 集成测试。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app


@pytest.fixture
def client() -> TestClient:
    """FastAPI 测试客户端。"""
    return TestClient(app)


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


@pytest.fixture
def audit_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """将审计服务的报告/MPQ/任务目录指向临时目录。"""
    from app.services import patch_audit

    reports = tmp_path / "reports"
    reports.mkdir()
    patched = Settings()
    patched.project_root = tmp_path
    patched.patch_jobs_dir = tmp_path / "patch-jobs"
    monkeypatch.setattr(patch_audit, "REPORTS_DIR", reports)
    monkeypatch.setattr(patch_audit, "MPQ_OUTPUT_DIR", tmp_path / "mpq")
    monkeypatch.setattr(patch_audit, "settings", patched)
    return tmp_path


def _write_audit_env(tmp_path: Path, *, with_audit: bool = True) -> None:
    """构造带审计切片的批次报告与任务记录。"""
    report = {
        "generated_at": "2026-01-01T12:00:00+00:00",
        "batch": "20260101_120000",
        "job_ids": ["mount_0003"],
        "jobs": [{"job_id": "mount_0003", "resource_name": "审计测试", "model_folder": "audit_mount"}],
        "dbc": [
            {
                "dbc_file": "Spell.dbc",
                "record_id": 80000,
                "job_id": "mount_0003",
                "action": "add",
                "action_taken": "added",
                "before": None,
                "after": {"ID": 80000},
            }
        ],
        "sql": [
            {
                "job_id": "mount_0003",
                "output_sql_file": "data/sql/mounts/0003_x/0003_mount_add.sql",
                "status": "written",
                "tables": [{"name": "item_template", "operation": "insert", "records": [{"entry": 91000}]}],
            }
        ],
        "mpq": {
            "batch": "20260101_120000",
            "path": "patch-mounts.mpq",
            "obfuscation": "none",
            "file_count": 1,
            "counts_by_kind": {"dbc": 1},
            "files": [{"path": "DBFilesClient/Spell.dbc", "size_bytes": 10, "sha256": "aaa", "kind": "dbc"}],
            "diff": None,
        },
    }
    report_dir = tmp_path / "reports" / "20260101_120000"
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "audit-report.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")

    output: dict = {"sql_files": ["data/sql/mounts/0003_x/0003_mount_add.sql"]}
    if with_audit:
        output["audit"] = "reports/20260101_120000/audit-report.json"
    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "job.json").write_text(
        json.dumps(
            {
                "job_id": "mount_0003",
                "resource_type": "mount",
                "resource_id": 3,
                "resource_name": "审计测试",
                "resource_model_folder": "audit_mount",
                "status": "generated",
                "artifacts": {"output": output},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def test_get_patch_job_audit(client: TestClient, audit_env: Path) -> None:
    """测试获取任务审计切片。"""
    _write_audit_env(audit_env)

    response = client.get("/api/patches/mount_0003/audit")
    assert response.status_code == 200

    data = response.json()
    assert data["job_id"] == "mount_0003"
    assert data["resource_name"] == "审计测试"
    assert data["report"]["batch"] == "20260101_120000"
    assert data["dbc"][0]["after"]["ID"] == 80000
    assert data["sql"]["status"] == "written"
    assert data["mpq"]["obfuscation"] == "none"


def test_get_patch_job_audit_not_found(client: TestClient, audit_env: Path) -> None:
    """测试获取不存在任务的审计返回 404。"""
    assert client.get("/api/patches/mount_9999/audit").status_code == 404


def test_get_patch_job_audit_legacy_job(client: TestClient, audit_env: Path) -> None:
    """审计功能上线前构建的任务（无 audit 路径）返回 404 且提示明确。"""
    _write_audit_env(audit_env, with_audit=False)

    response = client.get("/api/patches/mount_0003/audit")
    assert response.status_code == 404
    assert "审计功能上线前" in response.json()["detail"]


@pytest.fixture
def cleaner_dirs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> dict[str, Path]:
    """将工作区清理范围四目录指向临时目录。"""
    from app.services import workspace_cleaner

    dirs = {
        "patch_jobs": tmp_path / "patch-jobs",
        "mpq": tmp_path / "mpq",
        "reports": tmp_path / "reports",
        "dist": tmp_path / "dist",
    }
    for d in dirs.values():
        d.mkdir(parents=True)
    monkeypatch.setattr(workspace_cleaner, "PATCH_JOBS_DIR", dirs["patch_jobs"])
    monkeypatch.setattr(workspace_cleaner, "MPQ_DIR", dirs["mpq"])
    monkeypatch.setattr(workspace_cleaner, "REPORTS_DIR", dirs["reports"])
    monkeypatch.setattr(workspace_cleaner, "DIST_DIR", dirs["dist"])
    return dirs


def test_create_patch_job(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试导出单个 mount 补丁任务。"""
    response = client.post(
        "/api/patches/export-request",
        json={"resource_type": "mount", "resource_ids": [3]},
    )
    assert response.status_code == 200

    data = response.json()
    assert data["total"] == 1
    job = data["jobs"][0]
    assert job["resource_type"] == "mount"
    assert job["resource_id"] == 3
    assert job["status"] == "requested"

    job_dir = patch_jobs_dir / job["job_id"]
    assert (job_dir / "job.json").exists()
    job_data = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
    assert job_data["resource_type"] == "mount"
    assert job_data["resource_id"] == 3
    assert job_data["status"] == "requested"
    # 任务目录不应包含任何快照产物
    assert not (job_dir / "input").exists()
    assert not (job_dir / "manifest.json").exists()


def test_create_patch_job_non_mount(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试非 mount 类型被拒绝。"""
    response = client.post(
        "/api/patches/export-request",
        json={"resource_type": "pet", "resource_ids": [1]},
    )
    assert response.status_code == 400


def test_create_patch_job_empty_ids(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试空 resource_ids 被拒绝。"""
    response = client.post(
        "/api/patches/export-request",
        json={"resource_type": "mount", "resource_ids": []},
    )
    assert response.status_code == 400


def test_create_patch_job_invalid_id(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试不存在的资源 ID 返回 400。"""
    response = client.post(
        "/api/patches/export-request",
        json={"resource_type": "mount", "resource_ids": [999999]},
    )
    assert response.status_code == 400


def test_get_patch_job(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试获取单个补丁任务。"""
    create_response = client.post(
        "/api/patches/export-request",
        json={"resource_type": "mount", "resource_ids": [3]},
    )
    job_id = create_response.json()["jobs"][0]["job_id"]

    response = client.get(f"/api/patches/{job_id}")
    assert response.status_code == 200

    data = response.json()
    assert data["job_id"] == job_id
    assert data["status"] == "requested"


def test_get_patch_job_not_found(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试获取不存在的任务返回 404。"""
    response = client.get("/api/patches/not-exist")
    assert response.status_code == 404


def test_update_patch_job(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试更新补丁任务状态。"""
    create_response = client.post(
        "/api/patches/export-request",
        json={"resource_type": "mount", "resource_ids": [3]},
    )
    job_id = create_response.json()["jobs"][0]["job_id"]

    response = client.put(
        f"/api/patches/{job_id}",
        json={
            "status": "generated",
            "artifacts": {"sql_patch": "output/db_patch.sql"},
            "summary": "测试生成完成",
        },
    )
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "generated"
    assert data["artifacts"]["output"]["sql_patch"] == "output/db_patch.sql"
    assert data["summary"] == "测试生成完成"
    assert data["completed_at"] is not None

    # 验证 job.json 已持久化
    job_path = patch_jobs_dir / job_id / "job.json"
    job_data = json.loads(job_path.read_text(encoding="utf-8"))
    assert job_data["status"] == "generated"
    assert job_data["updated_at"] is not None


def test_list_patch_jobs(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试列出补丁任务并过滤。"""
    client.post(
        "/api/patches/export-request",
        json={"resource_type": "mount", "resource_ids": [3]},
    )

    response = client.get("/api/patches?resource_type=mount&status=requested")
    assert response.status_code == 200

    data = response.json()
    assert data["total"] >= 1
    assert all(j["resource_type"] == "mount" and j["status"] == "requested" for j in data["items"])


def test_list_patch_jobs_by_resource_id(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试按 resource_id 过滤。"""
    client.post(
        "/api/patches/export-request",
        json={"resource_type": "mount", "resource_ids": [3]},
    )

    response = client.get("/api/patches?resource_id=3")
    assert response.status_code == 200

    data = response.json()
    assert all(j["resource_id"] == 3 for j in data["items"])


def test_list_patch_jobs_real_shaped_job(client: TestClient, patch_jobs_dir: Path) -> None:
    """回归：builder 裸写的 job.json（sql_files 为列表）必须能被列出。"""
    job_dir = patch_jobs_dir / "mount_0003"
    job_dir.mkdir(parents=True)
    job_dir.joinpath("job.json").write_text(
        json.dumps(
            {
                "job_id": "mount_0003",
                "created_at": "2026-09-03T00:04:42.819016+00:00",
                "created_by": "system",
                "resource_type": "mount",
                "resource_id": 3,
                "resource_name": "阿尔登韦德雄鹿",
                "resource_model_folder": "ardenwealdstagmount",
                "status": "generated",
                "updated_at": "2026-09-06T01:19:51.890650+00:00",
                "artifacts": {
                    "output": {
                        "dbc_dir": "data/wow-dbc/src/dbc",
                        "sql_files": ["data/sql/azerothcore-updates/mounts/0003_x/a.sql"],
                        "mpq": "workspace/mpq/20260906_011935/patch-mounts.mpq",
                        "validation_report": "workspace/reports/20260906_011935/validation-report.json",
                    }
                },
                "completed_at": "2026-09-06T01:19:51.890650+00:00",
                "summary": "处理 127 个坐骑",
            }
        ),
        encoding="utf-8",
    )

    response = client.get("/api/patches")
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["job_id"] == "mount_0003"


def test_delete_patch_job(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试删除补丁任务。"""
    create_response = client.post(
        "/api/patches/export-request",
        json={"resource_type": "mount", "resource_ids": [3]},
    )
    job_id = create_response.json()["jobs"][0]["job_id"]

    response = client.delete(f"/api/patches/{job_id}")
    assert response.status_code == 200
    assert response.json() == {"deleted": True, "job_id": job_id}

    assert not (patch_jobs_dir / job_id).exists()
    assert client.get(f"/api/patches/{job_id}").status_code == 404
    assert client.get("/api/patches").json()["total"] == 0


def test_delete_patch_job_invalid_pattern(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试非法 job_id 返回 400（路径穿越用例由服务层单测覆盖）。"""
    for bad_id in ("not-exist", "mount_1"):
        assert client.delete(f"/api/patches/{bad_id}").status_code == 400


def test_delete_patch_job_not_found(client: TestClient, patch_jobs_dir: Path) -> None:
    """测试删除不存在的任务返回 404。"""
    assert client.delete("/api/patches/mount_9999").status_code == 404


def test_delete_patch_job_while_building(
    client: TestClient, patch_jobs_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """测试构建运行中删除任务返回 409。"""
    create_response = client.post(
        "/api/patches/export-request",
        json={"resource_type": "mount", "resource_ids": [3]},
    )
    job_id = create_response.json()["jobs"][0]["job_id"]
    monkeypatch.setattr("app.services.patch_exporter.get_build_status", lambda: {"running": True})

    assert client.delete(f"/api/patches/{job_id}").status_code == 409
    assert (patch_jobs_dir / job_id).exists()


def test_clean_workspace_dry_run_and_execute(
    client: TestClient, cleaner_dirs: dict[str, Path]
) -> None:
    """测试工作区清理：默认 dry-run 预览，execute=True 执行。"""
    job_dir = cleaner_dirs["patch_jobs"] / "mount_0003"
    job_dir.mkdir()
    (job_dir / "job.json").write_text("{}", encoding="utf-8")
    batch_dir = cleaner_dirs["mpq"] / "20260101_120000"
    batch_dir.mkdir()
    (batch_dir / "patch-mounts.mpq").write_bytes(b"x" * 10)

    preview = client.post("/api/patches/clean", json={})
    assert preview.status_code == 200
    data = preview.json()
    assert data["dry_run"] is True
    assert len(data["targets"]) == 2
    assert job_dir.exists()  # 预览不删除

    executed = client.post("/api/patches/clean", json={"execute": True})
    assert executed.status_code == 200
    assert executed.json()["dry_run"] is False
    assert not job_dir.exists()
    assert not batch_dir.exists()


def test_clean_workspace_negative_older_than(
    client: TestClient, cleaner_dirs: dict[str, Path]
) -> None:
    """测试负数 older_than_days 返回 400。"""
    response = client.post("/api/patches/clean", json={"older_than_days": -1})
    assert response.status_code == 400


def test_clean_workspace_while_building(
    client: TestClient, cleaner_dirs: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """测试构建运行中清理返回 409。"""
    monkeypatch.setattr(
        "app.services.workspace_cleaner.get_build_status", lambda: {"running": True}
    )
    response = client.post("/api/patches/clean", json={})
    assert response.status_code == 409
