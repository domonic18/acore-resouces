"""资源跨数据源关联校验。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas.resource import Resource


@dataclass
class RelationshipField:
    source: str
    table: str
    field: str
    value: Any


@dataclass
class RelationshipRule:
    key: str
    name: str
    description: str
    fields: list[dict[str, str]]


@dataclass
class RelationshipCheck:
    rule: RelationshipRule
    status: str
    values: list[RelationshipField]
    common_value: Any


MOUNT_RELATIONSHIPS: list[RelationshipRule] = [
    RelationshipRule(
        key="spell_item",
        name="Spell ↔ Item",
        description="法术 ID 必须与 item_template.spellid_2 一致",
        fields=[
            {"source": "dbc", "table": "spell", "field": "id"},
            {"source": "db", "table": "item_template", "field": "spellid_2"},
        ],
    ),
    RelationshipRule(
        key="model_display",
        name="Model → Display",
        description="CreatureModelData.ID 必须与 CreatureDisplayInfo.ModelID 一致",
        fields=[
            {"source": "dbc", "table": "creature_model_data", "field": "id"},
            {"source": "dbc", "table": "creature_display_info", "field": "model_id"},
        ],
    ),
    RelationshipRule(
        key="display_template_info",
        name="Display ↔ Template ↔ ModelInfo",
        description=(
            "CreatureDisplayInfo.ID 必须与 creature_template.modelid1 "
            "和 creature_model_info.display_id 一致"
        ),
        fields=[
            {"source": "dbc", "table": "creature_display_info", "field": "id"},
            {"source": "db", "table": "creature_template", "field": "modelid1"},
            {"source": "db", "table": "creature_model_info", "field": "display_id"},
        ],
    ),
    RelationshipRule(
        key="entry_visual",
        name="Entry ↔ Visual",
        description="creature_template.entry 必须与 spell.visual_id 一致",
        fields=[
            {"source": "db", "table": "creature_template", "field": "entry"},
            {"source": "dbc", "table": "spell", "field": "visual_id"},
        ],
    ),
]


def _normalize_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    try:
        return int(str(value))
    except (ValueError, TypeError):
        return None


def _get_field_value(
    resource: Resource,
    source: str,
    table: str,
    field: str,
) -> Any:
    source_data = getattr(resource, source, {})
    if hasattr(source_data, "model_dump"):
        source_data = source_data.model_dump()
    table_data = source_data.get(table, {}) if isinstance(source_data, dict) else {}
    return table_data.get(field)


def check_mount_relationships(resource: Resource) -> list[RelationshipCheck]:
    """检查坐骑资源的跨数据源关联关系。"""
    results: list[RelationshipCheck] = []
    for rule in MOUNT_RELATIONSHIPS:
        values = [
            RelationshipField(
                source=field["source"],
                table=field["table"],
                field=field["field"],
                value=_get_field_value(
                    resource,
                    field["source"],
                    field["table"],
                    field["field"],
                ),
            )
            for field in rule.fields
        ]
        normalized = [_normalize_int(v.value) for v in values]
        present = [v for v in normalized if v is not None]

        status = "missing"
        common_value: Any = None
        if len(present) == len(values):
            first = present[0]
            status = "ok" if all(v == first for v in present) else "mismatch"
            common_value = first if status == "ok" else None
        elif len(present) > 1:
            first = present[0]
            all_match = all(v == first for v in present)
            status = "missing" if all_match else "mismatch"
            common_value = first if all_match else None

        results.append(
            RelationshipCheck(
                rule=rule,
                status=status,
                values=values,
                common_value=common_value,
            )
        )
    return results


def check_resource_relationships(resource: Resource) -> list[RelationshipCheck]:
    """根据资源类型执行关联校验。"""
    if resource.resource_type == "mount":
        return check_mount_relationships(resource)
    return []
