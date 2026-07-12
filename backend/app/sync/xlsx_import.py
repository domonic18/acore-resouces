from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import yaml
from openpyxl import load_workbook

from app.core.config import settings
from app.schemas.resource import Mount, Npc, Pet, Resource

SCHEMA_MAP = {
    "mount": Mount,
    "pet": Pet,
    "npc": Npc,
}


def _load_mapping(resource_type: str) -> dict[str, Any]:
    mapping_path = settings.mapping_dir / f"{resource_type}.mapping.yaml"
    with mapping_path.open("r", encoding="utf-8") as f:
        return cast(dict[str, Any], yaml.safe_load(f))


def _set_nested(data: dict[str, Any], key: str, value: Any) -> None:
    parts = key.split(".")
    current = data
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


def _parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().upper() in ("Y", "YES", "TRUE", "1", "是")


def _parse_number(value: Any) -> int | float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        text = str(value).strip()
        if not text:
            return None
        if "." in text:
            return float(text)
        return int(text)
    except ValueError:
        return None


def _row_to_resource(
    row: tuple[Any, ...],
    mapping: dict[str, Any],
) -> Resource:
    resource_type = mapping["resource_type"]
    schema_cls = SCHEMA_MAP[resource_type]
    data: dict[str, Any] = {"resource_type": resource_type}

    for field_key, col_idx in mapping["fields"].items():
        value = row[col_idx] if col_idx < len(row) else None

        if value is None or (isinstance(value, str) and not value.strip()):
            continue

        if field_key in ("debug_passed", "added"):
            value = _parse_bool(value)
        elif field_key in (
            "id",
            "drop.entry",
            "dbc.creature_model_data.id",
            "dbc.creature_display_info.id",
            "dbc.creature_display_info.model_id",
            "db.creature_template.entry",
            "db.creature_template.modelid1",
            "db.creature_model_info.display_id",
        ):
            value = _parse_number(value)
        elif field_key == "drop.rate":
            value = _parse_number(value)
        elif isinstance(value, str):
            value = value.strip()

        _set_nested(data, field_key, value)

    return cast(Resource, schema_cls(**data))


def import_xlsx(
    input_path: Path,
    resource_type: str,
    *,
    dry_run: bool = False,
    limit: int | None = None,
) -> dict[str, Any]:
    mapping = _load_mapping(resource_type)

    workbook = load_workbook(input_path, read_only=True, data_only=True)
    sheet = workbook[mapping["sheet"]]

    data_start_row = mapping.get("data_start_row", 3)
    created = 0
    updated = 0
    errors: list[dict[str, Any]] = []
    resources: list[Resource] = []

    for row_idx, row in enumerate(
        sheet.iter_rows(min_row=data_start_row, values_only=True), start=data_start_row
    ):
        if limit is not None and created >= limit:
            break

        if not row or all(cell is None for cell in row):
            continue

        id_value = _parse_number(row[mapping["fields"]["id"]]) if "id" in mapping["fields"] else None
        model_folder_col = mapping["fields"].get("model_folder")
        model_folder_value = (
            str(row[model_folder_col]).strip()
            if model_folder_col is not None and model_folder_col < len(row) and row[model_folder_col]
            else ""
        )

        if id_value is None or not model_folder_value:
            continue

        try:
            resource = _row_to_resource(row, mapping)
            resources.append(resource)
            if not dry_run:
                from app.services.resource_store import save_resource

                save_resource(resource)
            created += 1
        except Exception as exc:  # noqa: BLE001
            errors.append({"row": row_idx, "error": str(exc)})

    workbook.close()

    return {
        "resource_type": resource_type,
        "dry_run": dry_run,
        "created": created,
        "updated": updated,
        "errors": errors,
        "sample": resources[:3] if dry_run else [],
    }
