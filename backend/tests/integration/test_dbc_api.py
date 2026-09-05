"""DBC 查询 API 集成测试。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import dbc_query

client = TestClient(app)

_requires_dbc = pytest.mark.skipif(
    not dbc_query.ITEM_DISPLAY_INFO_PATH.exists(),
    reason="本地 ItemDisplayInfo.dbc 不存在",
)


@_requires_dbc
def test_search_item_display_info_default() -> None:
    response = client.get("/api/dbc/item-display-info")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] > 60000
    assert len(data["items"]) == 60
    first = data["items"][0]
    assert set(first.keys()) == {"id", "icon_name"}


@_requires_dbc
def test_search_item_display_info_by_name() -> None:
    response = client.get("/api/dbc/item-display-info", params={"search": "inv_belt_45"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert any(item["id"] == 95971 for item in data["items"])


@_requires_dbc
def test_search_item_display_info_by_id_prefix() -> None:
    response = client.get("/api/dbc/item-display-info", params={"search": "9597", "limit": 200})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert all(str(item["id"]).startswith("9597") for item in data["items"])


@_requires_dbc
def test_get_item_display_info_hit() -> None:
    response = client.get("/api/dbc/item-display-info/31511")
    assert response.status_code == 200
    assert response.json() == {"id": 31511, "icon_name": "INV_Misc_Horn_01"}


@_requires_dbc
def test_get_item_display_info_not_found() -> None:
    response = client.get("/api/dbc/item-display-info/99999999")
    assert response.status_code == 404


def test_search_limit_validation() -> None:
    response = client.get("/api/dbc/item-display-info", params={"limit": 500})
    assert response.status_code == 422
