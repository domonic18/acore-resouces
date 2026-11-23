"""坐骑数据落地校验单元测试。"""

from __future__ import annotations

import pytest

from app.schemas.resource import Mount
from app.services import mount_db_verifier as verifier


def _make_mount(
    resource_id: int = 1,
    entry: int | None = None,
    display_id: int | None = None,
    item_entry: int | None = None,
) -> Mount:
    """构造一个带数据库记录的坐骑资源。"""
    return Mount(
        id=resource_id,
        model_folder=f"mount{resource_id:04d}",
        db={
            "creature_template": {
                "entry": entry if entry is not None else 9140000 + resource_id,
                "name": f"坐骑{resource_id}",
            },
            "creature_model_info": {
                "display_id": display_id if display_id is not None else 140000 + resource_id
            },
            "item_template": {
                "entry": item_entry if item_entry is not None else 90000 + resource_id
            },
        },
    )


def test_check_mounts_db_reports_missing_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        verifier,
        "_query_ids",
        lambda table, column, values: (
            set(values) if table == verifier.TABLE_CREATURE_TEMPLATE else set()
        ),
    )
    monkeypatch.setattr(verifier, "_query_creatures_with_model", lambda ids: set())

    report = verifier.check_mounts_db([_make_mount(1)])

    assert not report.skipped
    assert report.error_count == 3
    missing = {check.description for check in report.results[0].missing}
    assert missing == {
        "creature_template_model.CreatureID=9140001",
        "creature_model_info.DisplayID=140001",
        "item_template.entry=90001",
    }


def test_check_mounts_db_complete(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(verifier, "_query_ids", lambda table, column, values: set(values))
    monkeypatch.setattr(verifier, "_query_creatures_with_model", lambda ids: set(ids))

    report = verifier.check_mounts_db([_make_mount(1)])

    assert report.error_count == 0
    assert report.results[0].is_complete


def test_check_mounts_db_skips_when_db_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(table: str, column: str, values: set[int]) -> set[int]:
        raise verifier.DbApplyError("容器未启动")

    monkeypatch.setattr(verifier, "_query_ids", _raise)

    report = verifier.check_mounts_db([_make_mount(1)])

    assert report.skipped
    assert report.skip_reason == "容器未启动"
