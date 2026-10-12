"""资源跨数据源关联校验。"""

from __future__ import annotations

from collections.abc import Sequence
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
        name="Display ↔ ModelInfo",
        description="CreatureDisplayInfo.ID 必须与 creature_model_info.display_id 一致",
        fields=[
            {"source": "dbc", "table": "creature_display_info", "field": "id"},
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


@dataclass
class UniqueIdField:
    """需要全局唯一的资源字段定义。"""

    source: str
    table: str
    field: str

    @property
    def path(self) -> str:
        return f"{self.source}.{self.table}.{self.field}"


@dataclass
class DuplicateIdIssue:
    """跨资源重复 ID 问题。"""

    field: UniqueIdField
    value: int
    resources: list[tuple[int, str]]


class DuplicateIdError(Exception):
    """发现资源间存在重复的唯一 ID。"""

    def __init__(self, issues: list[DuplicateIdIssue]) -> None:
        self.issues = issues
        super().__init__(f"发现 {len(issues)} 组重复 ID")


# 坐骑资源中需要全局唯一的 ID 字段。
MOUNT_UNIQUE_ID_FIELDS: list[UniqueIdField] = [
    UniqueIdField("dbc", "creature_model_data", "id"),
    UniqueIdField("dbc", "creature_display_info", "id"),
    UniqueIdField("dbc", "spell", "id"),
    UniqueIdField("dbc", "spell", "visual_id"),
    UniqueIdField("dbc", "item", "id"),
    UniqueIdField("db", "creature_template", "entry"),
    UniqueIdField("db", "creature_model_info", "display_id"),
    UniqueIdField("db", "item_template", "entry"),
]


def _is_valid_unique_id(value: int | None) -> bool:
    """忽略空值、0 和负数。"""
    return value is not None and value > 0


def check_duplicate_resource_ids(
    resources: Sequence[Resource],
    *,
    focus_resource: Resource | None = None,
    id_fields: list[UniqueIdField] | None = None,
) -> list[DuplicateIdIssue]:
    """检查资源列表中是否存在重复的全局唯一 ID。

    Args:
        resources: 待检查的资源列表。
        focus_resource: 若指定，只返回涉及该资源的重复项。
        id_fields: 需要检查的字段列表，默认使用 MOUNT_UNIQUE_ID_FIELDS。

    Returns:
        发现的重复问题列表。
    """
    fields = id_fields or MOUNT_UNIQUE_ID_FIELDS
    groups: dict[tuple[str, int], list[tuple[int, str]]] = {}

    for resource in resources:
        resource_key = (resource.id, resource.model_folder)
        for field in fields:
            value = _get_field_value(resource, field.source, field.table, field.field)
            normalized = _normalize_int(value)
            if normalized is None or normalized <= 0:
                continue
            groups.setdefault((field.path, normalized), []).append(resource_key)

    issues: list[DuplicateIdIssue] = []
    for (field_path, value), resource_keys in groups.items():
        # 同一资源在 existing + imported 场景中可能出现两次，需要去重。
        unique_keys = list(dict.fromkeys(resource_keys))
        if len(unique_keys) < 2:
            continue
        if focus_resource is not None:
            focus_key = (focus_resource.id, focus_resource.model_folder)
            if focus_key not in unique_keys:
                continue
        field = next(f for f in fields if f.path == field_path)
        issues.append(DuplicateIdIssue(field=field, value=value, resources=unique_keys))

    return issues


def format_duplicate_issue(issue: DuplicateIdIssue) -> str:
    """将重复问题格式化为人类可读字符串。"""
    names = [f"{resource_id:04d}-{model_folder}" for resource_id, model_folder in issue.resources]
    return f"重复 ID: {issue.field.path}={issue.value} 出现在 {', '.join(names)}"
