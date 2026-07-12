from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import yaml
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import Base, SessionLocal, engine
from app.models.resource import Mount, Npc, Pet
from app.schemas.resource import Mount as MountSchema
from app.schemas.resource import Npc as NpcSchema
from app.schemas.resource import Pet as PetSchema
from app.schemas.resource import Resource

RESOURCE_TYPE_MAP: dict[str, tuple[Any, type]] = {
    "mounts": (Mount, MountSchema),
    "pets": (Pet, PetSchema),
    "npcs": (Npc, NpcSchema),
}

TYPE_TO_DIR = {
    "mount": "mounts",
    "pet": "pets",
    "npc": "npcs",
}


def _ensure_dirs() -> None:
    settings.resources_dir.mkdir(parents=True, exist_ok=True)
    for sub in ("mounts", "pets", "npcs"):
        (settings.resources_dir / sub).mkdir(parents=True, exist_ok=True)
    settings.schemas_dir.mkdir(parents=True, exist_ok=True)
    settings.mapping_dir.mkdir(parents=True, exist_ok=True)


def _yaml_path(resource_type: str, resource_id: int, model_folder: str) -> Path:
    plural = TYPE_TO_DIR.get(resource_type, resource_type + "s")
    filename = f"{resource_id:04d}-{model_folder}.yaml"
    return settings.resources_dir / plural / filename


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return cast(dict[str, Any], yaml.safe_load(f) or {})


def _save_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)


def _model_to_dict(model: Any) -> dict[str, Any]:
    data = cast(dict[str, Any], json.loads(model.raw_yaml))
    data["id"] = model.id
    data["model_folder"] = model.model_folder
    data["preview_image"] = model.preview_image
    data["debug_passed"] = model.debug_passed
    data["added"] = model.added
    return data


def load_resource(resource_type: str, resource_id: int) -> Resource | None:
    _ensure_dirs()
    plural = TYPE_TO_DIR.get(resource_type, resource_type + "s")
    dir_path = settings.resources_dir / plural
    for path in dir_path.glob(f"{resource_id:04d}-*.yaml"):
        data = _load_yaml(path)
        _, schema_cls = RESOURCE_TYPE_MAP.get(plural, (None, None))
        if schema_cls:
            return cast(Resource, schema_cls(**data))
    return None


def list_resources(resource_type: str | None = None) -> list[Resource]:
    _ensure_dirs()
    results: list[Resource] = []
    types = [resource_type] if resource_type else ["mount", "pet", "npc"]
    for t in types:
        plural = TYPE_TO_DIR.get(t, t + "s")
        _, schema_cls = RESOURCE_TYPE_MAP.get(plural, (None, None))
        if not schema_cls:
            continue
        dir_path = settings.resources_dir / plural
        for path in sorted(dir_path.glob("*.yaml")):
            data = _load_yaml(path)
            results.append(cast(Resource, schema_cls(**data)))
    return results


def save_resource(resource: Resource, *, filename_suffix: str | None = None) -> Path:
    _ensure_dirs()
    data = resource.model_dump(exclude_none=False)
    data.pop("resource_type", None)
    path = _yaml_path(resource.resource_type, resource.id, resource.model_folder)
    if filename_suffix:
        path = path.with_name(f"{path.stem}-{filename_suffix}{path.suffix}")
    _save_yaml(path, data)
    _update_registry()
    _sync_to_sqlite(resource)
    return path


def delete_resource(resource_type: str, resource_id: int) -> bool:
    _ensure_dirs()
    plural = TYPE_TO_DIR.get(resource_type, resource_type + "s")
    dir_path = settings.resources_dir / plural
    for path in dir_path.glob(f"{resource_id:04d}-*.yaml"):
        path.unlink()
        _update_registry()
        _remove_from_sqlite(resource_type, resource_id)
        return True
    return False


def _update_registry() -> None:
    registry: dict[str, Any] = {
        "version": "1.0",
        "counts": {"mounts": 0, "pets": 0, "npcs": 0},
        "mounts": [],
        "pets": [],
        "npcs": [],
    }
    for plural in ("mounts", "pets", "npcs"):
        _, schema_cls = RESOURCE_TYPE_MAP[plural]
        dir_path = settings.resources_dir / plural
        for path in sorted(dir_path.glob("*.yaml")):
            data = _load_yaml(path)
            obj = schema_cls(**data)
            counts = cast(dict[str, int], registry["counts"])
            counts[plural] += 1
            cast(list[dict[str, Any]], registry[plural]).append(
                {
                    "id": obj.id,
                    "name": obj.official_db.name or obj.model_folder,
                    "model_folder": obj.model_folder,
                    "file": str(path.relative_to(settings.project_root)),
                    "debug_passed": obj.debug_passed,
                    "added": obj.added,
                }
            )
    settings.registry_file.parent.mkdir(parents=True, exist_ok=True)
    with settings.registry_file.open("w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def _sync_to_sqlite(resource: Resource) -> None:
    init_db()
    db = SessionLocal()
    try:
        plural = TYPE_TO_DIR.get(resource.resource_type, resource.resource_type + "s")
        model_cls, _ = RESOURCE_TYPE_MAP[plural]
        data = resource.model_dump(exclude_none=False)
        data.pop("resource_type", None)
        existing = db.query(model_cls).filter(model_cls.id == resource.id).first()
        if existing:
            existing.model_folder = resource.model_folder  # type: ignore[assignment]
            existing.preview_image = resource.preview_image  # type: ignore[assignment]
            existing.debug_passed = resource.debug_passed  # type: ignore[assignment]
            existing.added = resource.added  # type: ignore[assignment]
            existing.raw_yaml = yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
            for attr in ("mount_type", "star_rating", "subtype", "rarity"):
                if hasattr(existing, attr) and attr in data:
                    setattr(existing, attr, data[attr])
        else:
            kwargs: dict[str, Any] = {
                "id": resource.id,
                "model_folder": resource.model_folder,
                "preview_image": resource.preview_image,
                "debug_passed": resource.debug_passed,
                "added": resource.added,
                "raw_yaml": yaml.safe_dump(data, allow_unicode=True, sort_keys=False),
            }
            for attr in ("mount_type", "star_rating", "subtype", "rarity"):
                if hasattr(model_cls, attr) and attr in data:
                    kwargs[attr] = data[attr]
            db.add(model_cls(**kwargs))
        db.commit()
    finally:
        db.close()


def _remove_from_sqlite(resource_type: str, resource_id: int) -> None:
    db = SessionLocal()
    try:
        plural = TYPE_TO_DIR.get(resource_type, resource_type + "s")
        model_cls, _ = RESOURCE_TYPE_MAP[plural]
        db.query(model_cls).filter(model_cls.id == resource_id).delete()
        db.commit()
    finally:
        db.close()


def sync_all_to_sqlite() -> None:
    init_db()
    db = SessionLocal()
    try:
        for plural in ("mounts", "pets", "npcs"):
            model_cls, schema_cls = RESOURCE_TYPE_MAP[plural]
            db.query(model_cls).delete()
            dir_path = settings.resources_dir / plural
            for path in sorted(dir_path.glob("*.yaml")):
                data = _load_yaml(path)
                obj = schema_cls(**data)
                data_dump = obj.model_dump(exclude_none=False)
                data_dump.pop("resource_type", None)
                kwargs: dict[str, Any] = {
                    "id": obj.id,
                    "model_folder": obj.model_folder,
                    "preview_image": obj.preview_image,
                    "debug_passed": obj.debug_passed,
                    "added": obj.added,
                    "raw_yaml": yaml.safe_dump(data_dump, allow_unicode=True, sort_keys=False),
                }
                for attr in ("mount_type", "star_rating", "subtype", "rarity"):
                    if hasattr(model_cls, attr) and attr in data_dump:
                        kwargs[attr] = data_dump[attr]
                db.add(model_cls(**kwargs))
        db.commit()
    finally:
        db.close()


def get_db_session() -> Session:
    return SessionLocal()
