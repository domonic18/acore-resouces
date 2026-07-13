"""预览 API 集成测试。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SAMPLE_BLP = "sources/icons/interface/icons/inv_hippo_green.blp"


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_preview_blp() -> None:
    response = client.get(f"/api/preview/blp/{SAMPLE_BLP}?size=64")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"
    assert len(response.content) > 0


def test_preview_icon() -> None:
    response = client.get("/api/preview/icon/inv_hippo_green?size=64")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/webp"


def test_preview_icon_not_found() -> None:
    response = client.get("/api/preview/icon/nonexistent_icon_xyz")
    assert response.status_code == 404


def test_get_resource_assets() -> None:
    response = client.get("/api/resources/mount/3/assets")
    assert response.status_code == 200
    data = response.json()
    assert data["model_folder"]
    assert "m2_files" in data
    assert "texture_files" in data


def test_preview_model() -> None:
    response = client.get("/api/preview/model/ardenwealdstagmount影叶符文牡鹿?resource_type=mount")
    assert response.status_code == 200
    data = response.json()
    assert data["model_folder"] == "ardenwealdstagmount影叶符文牡鹿"
    assert data["resource_type"] == "mount"
    assert data["status"] in ("available", "skin_missing")
    assert "metadata" in data
    assert "m2_files" in data
    assert "skin_files" in data
    assert "blp_files" in data
    assert "main_m2" in data


def test_stream_m2_file() -> None:
    response = client.get("/api/preview/model/ardenwealdstagmount影叶符文牡鹿?resource_type=mount")
    assert response.status_code == 200
    data = response.json()
    assert data["main_m2"]

    response = client.get(f"/api/preview/m2/ardenwealdstagmount影叶符文牡鹿/file/{data['main_m2']}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert len(response.content) > 0
    assert response.content[:4] == b"MD20"


def test_stream_m2_file_not_found() -> None:
    response = client.get("/api/preview/m2/ardenwealdstagmount影叶符文牡鹿/file/sources/mounts/nonexistent.m2")
    assert response.status_code == 404


def test_preview_model_not_found() -> None:
    response = client.get("/api/preview/model/__nonexistent_model__")
    assert response.status_code == 404


def test_illegal_path() -> None:
    from fastapi import HTTPException

    from app.api.preview import _resolve_source_path

    with pytest.raises(HTTPException) as exc_info:
        _resolve_source_path("../etc/passwd")
    assert exc_info.value.status_code == 403
