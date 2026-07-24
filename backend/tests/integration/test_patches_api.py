"""补丁任务 API 集成测试。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, settings
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
    assert (job_dir / "input" / "resource.yaml").exists()
    assert (job_dir / "input" / "assets.json").exists()
    assert (job_dir / "input" / "dbc-plan.yaml").exists()
    assert (job_dir / "input" / "sql-plan.yaml").exists()
    assert (job_dir / "input" / "README.md").exists()
    assert (job_dir / "manifest.json").exists()


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

    # 验证 manifest.json 已持久化
    manifest_path = patch_jobs_dir / job_id / "manifest.json"
    manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest_data["status"] == "generated"


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
