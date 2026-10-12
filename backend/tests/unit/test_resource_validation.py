"""资源全局唯一 ID 重复校验测试。"""

from __future__ import annotations

import pytest

from app.schemas.resource import Mount
from app.services.resource_validation import (
    DuplicateIdError,
    check_duplicate_resource_ids,
    format_duplicate_issue,
)


def _mount(
    resource_id: int,
    model_folder: str,
    **kwargs: object,
) -> Mount:
    """构造最小坐骑资源。"""
    return Mount(
        id=resource_id,
        model_folder=model_folder,
        **kwargs,  # type: ignore[arg-type]
    )


def test_no_duplicates() -> None:
    resources = [
        _mount(
            1,
            "a",
            dbc={
                "creature_model_data": {"id": 100},
                "creature_display_info": {"id": 200},
                "spell": {"id": 300, "visual_id": 400},
                "item": {"id": 500},
            },
            db={
                "creature_template": {"entry": 600},
                "creature_model_info": {"display_id": 200},
                "item_template": {"entry": 700},
            },
        ),
        _mount(
            2,
            "b",
            dbc={
                "creature_model_data": {"id": 101},
                "creature_display_info": {"id": 201},
                "spell": {"id": 301, "visual_id": 401},
                "item": {"id": 501},
            },
            db={
                "creature_template": {"entry": 601},
                "creature_model_info": {"display_id": 201},
                "item_template": {"entry": 701},
            },
        ),
    ]
    assert check_duplicate_resource_ids(resources) == []


def test_duplicate_creature_display_info_id() -> None:
    resources = [
        _mount(1, "a", dbc={"creature_display_info": {"id": 200}}),
        _mount(2, "b", dbc={"creature_display_info": {"id": 200}}),
    ]
    issues = check_duplicate_resource_ids(resources)
    assert len(issues) == 1
    issue = issues[0]
    assert issue.field.path == "dbc.creature_display_info.id"
    assert issue.value == 200
    assert sorted(issue.resources) == [(1, "a"), (2, "b")]


def test_multiple_duplicate_fields() -> None:
    resources = [
        _mount(
            1,
            "a",
            dbc={"spell": {"id": 300, "visual_id": 400}},
            db={"creature_template": {"entry": 400}},
        ),
        _mount(
            2,
            "b",
            dbc={"spell": {"id": 300, "visual_id": 400}},
            db={"creature_template": {"entry": 400}},
        ),
    ]
    issues = check_duplicate_resource_ids(resources)
    paths = {issue.field.path for issue in issues}
    assert paths == {
        "dbc.spell.id",
        "dbc.spell.visual_id",
        "db.creature_template.entry",
    }


def test_zero_negative_and_empty_ignored() -> None:
    resources = [
        _mount(1, "a", dbc={"spell": {"id": 0}}, db={"item_template": {"entry": -1}}),
        _mount(2, "b", dbc={"spell": {"id": None}}, db={"item_template": {"entry": ""}}),
    ]
    assert check_duplicate_resource_ids(resources) == []


def test_focus_resource_filter() -> None:
    a = _mount(1, "a", dbc={"spell": {"id": 300}})
    b = _mount(2, "b", dbc={"spell": {"id": 300}})
    c = _mount(3, "c", dbc={"spell": {"id": 301}})
    issues = check_duplicate_resource_ids([a, b, c], focus_resource=c)
    assert issues == []

    issues = check_duplicate_resource_ids([a, b, c], focus_resource=a)
    assert len(issues) == 1
    assert issues[0].resources == [(1, "a"), (2, "b")]


def test_format_duplicate_issue() -> None:

    issue = check_duplicate_resource_ids(
        [
            _mount(1, "alpha", dbc={"spell": {"id": 42}}),
            _mount(2, "beta", dbc={"spell": {"id": 42}}),
        ]
    )[0]
    text = format_duplicate_issue(issue)
    assert "dbc.spell.id=42" in text
    assert "0001-alpha" in text
    assert "0002-beta" in text


def test_duplicate_id_error() -> None:
    with pytest.raises(DuplicateIdError) as exc_info:
        raise DuplicateIdError(
            check_duplicate_resource_ids(
                [
                    _mount(1, "a", dbc={"spell": {"id": 1}}),
                    _mount(2, "b", dbc={"spell": {"id": 1}}),
                ]
            )
        )
    assert "1 组重复 ID" in str(exc_info.value)
    assert len(exc_info.value.issues) == 1
