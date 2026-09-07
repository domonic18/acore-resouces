"""DBC 查询 API 集成测试。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import dbc_query, dbc_reader

client = TestClient(app)

_requires_dbc = pytest.mark.skipif(
    not dbc_query.ITEM_DISPLAY_INFO_PATH.exists(),
    reason="本地 ItemDisplayInfo.dbc 不存在",
)

_requires_generic_dbc = pytest.mark.skipif(
    not (dbc_reader.WOW_DBC_DIR / "Spell.dbc").is_file(),
    reason="本地 Spell.dbc 不存在",
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


@_requires_generic_dbc
def test_list_dbc_files() -> None:
    response = client.get("/api/dbc/files")
    assert response.status_code == 200

    data = response.json()
    assert data["total"] >= 200
    spell = next(item for item in data["items"] if item["name"] == "Spell.dbc")
    assert spell["record_count"] > 0
    assert spell["schema_registered"] is True
    assert spell["header"]["magic"] == "WDBC"
    assert spell["header"]["field_count"] > 100


@_requires_generic_dbc
def test_query_dbc_records_pagination() -> None:
    response = client.get("/api/dbc/Spell.dbc/records", params={"page": 1, "page_size": 5})
    assert response.status_code == 200

    data = response.json()
    assert data["page"] == 1
    assert data["page_size"] == 5
    assert data["total"] > 5
    assert [item["_index"] for item in data["items"]] == [1, 2, 3, 4, 5]
    assert len(data["items"]) == 5
    assert {"name", "type"} == set(data["fields"][0].keys())
    assert any(f["name"] == "ID" for f in data["fields"])
    assert isinstance(data["annotations"], list)


@_requires_generic_dbc
def test_query_dbc_records_filter_eq() -> None:
    page = client.get("/api/dbc/Spell.dbc/records", params={"page_size": 1}).json()
    record_id = page["items"][0]["_record_id"]

    response = client.get(
        "/api/dbc/Spell.dbc/records",
        params={"field": "ID", "op": "eq", "value": str(record_id)},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert data["items"][0]["_record_id"] == record_id


@_requires_generic_dbc
def test_query_dbc_records_filter_gt() -> None:
    response = client.get(
        "/api/dbc/Spell.dbc/records",
        params={"field": "ID", "op": "gt", "value": "0", "page_size": 1},
    )
    assert response.status_code == 200
    assert response.json()["total"] > 0


@_requires_generic_dbc
def test_query_dbc_records_unknown_field_rejected() -> None:
    response = client.get(
        "/api/dbc/Spell.dbc/records",
        params={"field": "NoSuchField", "op": "eq", "value": "1"},
    )
    assert response.status_code == 400


@_requires_generic_dbc
def test_query_dbc_records_invalid_op_rejected() -> None:
    response = client.get(
        "/api/dbc/Spell.dbc/records",
        params={"field": "ID", "op": "like", "value": "1"},
    )
    assert response.status_code == 400


@_requires_generic_dbc
def test_query_dbc_records_file_not_found() -> None:
    assert client.get("/api/dbc/NoSuch.dbc/records").status_code == 404


@_requires_generic_dbc
def test_get_dbc_record_detail() -> None:
    page = client.get("/api/dbc/Spell.dbc/records", params={"page_size": 1}).json()
    record_id = page["items"][0]["_record_id"]

    response = client.get(f"/api/dbc/Spell.dbc/records/{record_id}")
    assert response.status_code == 200

    data = response.json()
    assert data["record_id"] == record_id
    assert data["index"] == page["items"][0]["_index"]
    assert len(data["fields"]) > 100
    field = data["fields"][0]
    assert {"name", "type", "value"} == set(field.keys())
    assert isinstance(data["resources"], list)


@_requires_generic_dbc
def test_get_dbc_record_not_found() -> None:
    assert client.get("/api/dbc/Spell.dbc/records/999999999").status_code == 404
    assert client.get("/api/dbc/NoSuch.dbc/records/1").status_code == 404
