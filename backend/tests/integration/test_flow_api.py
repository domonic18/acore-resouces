"""生产流程相关 API 集成测试。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)

# 真实坐骑资源，用于验证端点在真实数据上的行为
SAMPLE_MOUNT_ID = 3

_requires_mount = pytest.mark.skipif(
    not (settings.project_root / "data/resources/mounts").exists(),
    reason="本地坐骑资源不存在",
)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200


@_requires_mount
def test_preview_returns_plan_and_readiness() -> None:
    response = client.get(f"/api/patches/preview/mount/{SAMPLE_MOUNT_ID}")
    assert response.status_code == 200
    data = response.json()
    assert data["resource_id"] == SAMPLE_MOUNT_ID
    assert "dbc_plan" in data and "sql_plan" in data
    assert isinstance(data["ready"], bool)
    assert isinstance(data["issues"], list)


@_requires_mount
def test_preview_rejects_non_mount_type() -> None:
    response = client.get("/api/patches/preview/pet/1")
    assert response.status_code in (400, 404)


@_requires_mount
def test_preview_404_for_missing_resource() -> None:
    response = client.get("/api/patches/preview/mount/999999")
    assert response.status_code == 404


@_requires_mount
def test_relationships_report() -> None:
    response = client.get(f"/api/resources/mount/{SAMPLE_MOUNT_ID}/relationships")
    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] in ("ok", "mismatch", "missing")
    assert len(data["relationships"]) == 4
    for check in data["relationships"]:
        assert check["status"] in ("ok", "mismatch", "missing")
        assert check["rule"]["key"]
        assert "values" in check


@_requires_mount
def test_flow_state_covers_all_steps() -> None:
    response = client.get(f"/api/resources/mount/{SAMPLE_MOUNT_ID}/flow")
    assert response.status_code == 200
    data = response.json()
    assert len(data["steps"]) == 9
    assert data["current_step_id"] in {step["step_id"] for step in data["steps"]}
    assert 1 <= data["current_step_index"] <= 9
    for step in data["steps"]:
        assert step["status"] in ("pending", "active", "done", "blocked")


@_requires_mount
def test_flow_404_for_missing_resource() -> None:
    response = client.get("/api/resources/mount/999999/flow")
    assert response.status_code == 404


@_requires_mount
def test_preview_batch_returns_all() -> None:
    """批量预览与逐个调用等价，按入参顺序返回。"""
    ids = [SAMPLE_MOUNT_ID, 4, 11]
    response = client.post("/api/patches/preview/batch", json={"resource_ids": ids})
    assert response.status_code == 200
    data = response.json()
    assert [item["resource_id"] for item in data] == ids
    for item in data:
        assert "ready" in item
        assert "issues" in item


def test_preview_batch_rejects_empty() -> None:
    response = client.post("/api/patches/preview/batch", json={"resource_ids": []})
    assert response.status_code == 400


@_requires_mount
def test_preview_batch_404_for_missing_resource() -> None:
    response = client.post(
        "/api/patches/preview/batch", json={"resource_ids": [999999]}
    )
    assert response.status_code == 404


def test_publish_accepts_batch_filter() -> None:
    """发布请求可指定批次；不指定时行为不变（发布全部未发布批次）。"""
    response = client.post(
        "/api/patches/publish",
        json={"dry_run": True, "batch_ids": ["__no_such_batch__"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["published"] == []
    assert "batch_ids" in data or data["skipped"] == []


def test_delete_batch_404_for_unknown_batch() -> None:
    response = client.delete("/api/patches/batches/__no_such_batch__")
    assert response.status_code == 404


def test_batches_endpoint_lists_batches() -> None:
    response = client.get("/api/patches/batches")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    for batch in data["items"]:
        assert "batch_id" in batch
        assert "jobs" in batch


def test_spell_icon_lookup() -> None:
    response = client.get("/api/dbc/spell-icon/lookup", params={"name": "inv_hippo_green"})
    assert response.status_code == 200
    data = response.json()
    assert "exact_ids" in data
    assert "candidates" in data


def test_spell_icon_lookup_requires_name() -> None:
    response = client.get("/api/dbc/spell-icon/lookup")
    assert response.status_code == 422


def test_job_scoped_endpoints_404_for_unknown_job() -> None:
    for path in (
        "/api/patches/jobs/mount_999999/validation-report",
        "/api/patches/jobs/mount_999999/plans",
        "/api/patches/jobs/mount_999999/artifacts",
    ):
        response = client.get(path)
        assert response.status_code == 404, path


def test_build_rejects_conflicting_scope() -> None:
    """job_ids 与 all_requested 同时给出时拒绝，避免语义含糊。"""
    response = client.post(
        "/api/patches/build",
        json={"all_requested": True, "job_ids": ["mount_0003"], "dry_run": True},
    )
    assert response.status_code == 400


def test_build_rejects_empty_scope() -> None:
    response = client.post("/api/patches/build", json={"dry_run": True})
    assert response.status_code == 400


def test_build_rejects_unknown_job_ids() -> None:
    response = client.post(
        "/api/patches/build",
        json={"job_ids": ["mount_999999"], "dry_run": True},
    )
    assert response.status_code == 404
