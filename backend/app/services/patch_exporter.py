"""补丁原料包导出服务。

负责为单个资源创建补丁任务目录，生成并写入：
- resource.yaml
- assets.json
- dbc-plan.yaml
- sql-plan.yaml
- README.md
- manifest.json

同时提供补丁任务的查询和状态更新能力。
"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import yaml

from app.core.config import settings
from app.preview.asset_resolver import resolve_resource_assets
from app.schemas.patch import (
    DBCPlan,
    DBCPlanFile,
    DBCPlanOperation,
    PatchArtifacts,
    PatchJobManifest,
    SQLPlan,
    SQLPlanTable,
)
from app.schemas.resource import Mount, Resource
from app.services.resource_store import load_resource

# 坐骑类型 -> Spell.dbc 属性映射
# 字段名以 wow-dbc-tool 的 schema 为准。
SPELL_PROFILES: dict[str, dict[str, Any]] = {
    "陆地坐骑": {
        "Attributes": 0,
        "AttributesExD": 0,
        "EffectAuraPeriod_1": 32,
        "EffectMechanic_1": 99,
        "EffectAuraPeriod_2": 0,
        "EffectMechanic_2": 0,
    },
    "慢速陆地坐骑": {
        "Attributes": 0,
        "AttributesExD": 0,
        "EffectAuraPeriod_1": 32,
        "EffectMechanic_1": 59,
        "EffectAuraPeriod_2": 0,
        "EffectMechanic_2": 0,
    },
    "飞行坐骑": {
        "Attributes": 0,
        "AttributesExD": 67108864,
        "EffectAuraPeriod_1": 207,
        "EffectMechanic_1": 279,
        "EffectAuraPeriod_2": 32,
        "EffectMechanic_2": 99,
    },
    "水上坐骑": {
        "Attributes": 0,
        "AttributesExD": 0,
        "EffectAuraPeriod_1": 32,
        "EffectMechanic_1": 99,
        "EffectAuraPeriod_2": 0,
        "EffectMechanic_2": 0,
    },
}


def _ensure_dir(path: Path) -> None:
    """确保目录存在。"""
    path.mkdir(parents=True, exist_ok=True)


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    """写入 YAML 文件。"""
    _ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)


def _write_json(path: Path, data: dict[str, Any]) -> None:
    """写入 JSON 文件。"""
    _ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _write_text(path: Path, content: str) -> None:
    """写入文本文件。"""
    _ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        f.write(content)


def _load_yaml(path: Path) -> dict[str, Any]:
    """读取 YAML 文件。"""
    with path.open("r", encoding="utf-8") as f:
        return cast(dict[str, Any], yaml.safe_load(f) or {})


def _build_job_id(resource: Resource) -> str:
    """生成固定任务 ID，仅按资源类型与 ID 命名，避免重复目录。"""
    return f"{resource.resource_type}_{resource.id:04d}"


def _asset_file_to_dict(asset: Any) -> dict[str, str]:
    """将 AssetFile 转为字典。"""
    return {
        "name": asset.name,
        "relative_path": asset.relative_path,
        "file_type": asset.file_type,
    }


def build_assets_json(resource: Resource) -> dict[str, Any]:
    """生成 assets.json 内容。"""
    assets = resolve_resource_assets(resource)
    source_dir = (
        assets.resource_dir.relative_to(settings.project_root)
        if assets.resource_dir.exists()
        else None
    )

    return {
        "resource_type": resource.resource_type,
        "resource_id": resource.id,
        "model_folder": resource.model_folder,
        "source_dir": str(source_dir) if source_dir else None,
        "exists": assets.exists,
        "model_name": resource.dbc.creature_model_data.get("model_name"),
        "texture_variations": [
            resource.dbc.creature_display_info.get(f"texture_variation_{i}") for i in (1, 2, 3)
        ],
        "m2_files": [_asset_file_to_dict(f) for f in assets.m2_files],
        "blp_files": [_asset_file_to_dict(f) for f in assets.texture_files],
        "matched_textures": [_asset_file_to_dict(f) for f in assets.matched_textures],
        "image_files": [_asset_file_to_dict(f) for f in assets.image_files],
        "icon_files": [_asset_file_to_dict(f) for f in assets.icon_files],
        "anim_files": [_asset_file_to_dict(f) for f in assets.anim_files],
    }


def build_dbc_plan(resource: Mount) -> DBCPlan:
    """根据坐骑资源生成 DBC 修改计划。"""
    spell_profile = SPELL_PROFILES.get(resource.mount_type or "", SPELL_PROFILES["陆地坐骑"]).copy()

    plans: list[DBCPlanFile] = []

    # CreatureModelData.dbc
    cmd = resource.dbc.creature_model_data
    if cmd and cmd.get("id"):
        plans.append(
            DBCPlanFile(
                dbc_file="CreatureModelData.dbc",
                operations=[
                    DBCPlanOperation(
                        action="add",
                        record_id=int(cmd["id"]),
                        reason="新增模型数据",
                        fields={
                            "ID": int(cmd["id"]),
                            "Flags": int(cmd.get("flags", 0)),
                            "ModelName": str(cmd.get("model_name", "")),
                            "ModelScale": float(cmd.get("model_scale", 1.0)),
                            "CollisionWidth": float(cmd.get("collision_width", 1.0)),
                            "CollisionHeight": float(cmd.get("collision_height", 1.0)),
                            "MountHeight": float(cmd.get("mount_height", 1.0)),
                        },
                    )
                ],
            )
        )

    # CreatureDisplayInfo.dbc
    cdi = resource.dbc.creature_display_info
    if cdi and cdi.get("id"):
        # 字段顺序与类型参考 CreatureDisplayInfo.schema.json
        cdi_fields: list[tuple[str, str, Any, Any]] = [
            ("ID", "id", int, 0),
            ("ModelID", "model_id", int, 0),
            ("SoundID", "sound_id", int, 0),
            ("ExtendedDisplayInfoID", "extra_display_information_id", int, 0),
            ("CreatureModelScale", "scale", float, 1.0),
            ("CreatureModelAlpha", "opacity", int, 255),
            ("TextureVariation_1", "texture_variation_1", str, ""),
            ("TextureVariation_2", "texture_variation_2", str, ""),
            ("TextureVariation_3", "texture_variation_3", str, ""),
            ("PortraitTextureName", "portrait_texture_name", str, ""),
            ("SizeClass", "size_class", int, 0),
            ("BloodID", "blood_id", int, 0),
            ("NPCSoundID", "npc_sound_id", int, 0),
            ("ParticleColorID", "particle_color_id", int, 0),
            ("CreatureGeosetData", "creature_geoset_data", int, 0),
            ("ObjectEffectPackageID", "object_effect_package_id", int, 0),
        ]
        fields: dict[str, Any] = {}
        for dbc_name, yaml_name, caster, default in cdi_fields:
            raw = cdi.get(yaml_name, default)
            if raw is None:
                raw = default
            try:
                fields[dbc_name] = caster(raw)
            except (ValueError, TypeError):
                fields[dbc_name] = default

        plans.append(
            DBCPlanFile(
                dbc_file="CreatureDisplayInfo.dbc",
                operations=[
                    DBCPlanOperation(
                        action="add",
                        record_id=int(cdi["id"]),
                        reason="新增显示信息",
                        fields=fields,
                    )
                ],
            )
        )

    # Spell.dbc
    spell = resource.dbc.spell
    if spell and spell.get("id") and cdi and cdi.get("id"):
        display_id = int(cdi["id"])
        spell_fields: dict[str, Any] = {
            "ID": int(spell["id"]),
            "Mechanic": 21,
            "Attributes": spell_profile["Attributes"],
            "AttributesExD": spell_profile["AttributesExD"],
            "Effect_1": 6,
            "EffectAura_1": 207,
            "EffectBasePoints_1": display_id,
            "EffectAuraPeriod_1": spell_profile["EffectAuraPeriod_1"],
            "EffectMechanic_1": spell_profile["EffectMechanic_1"],
            "Effect_2": 6,
            "EffectAura_2": 207,
            "EffectAuraPeriod_2": spell_profile["EffectAuraPeriod_2"],
            "EffectMechanic_2": spell_profile["EffectMechanic_2"],
            "EffectSpellClassMaskC_3": 7644,
            "SpellVisualID_1": int(spell.get("visual_id", 0)),
            "SpellIconID": int(spell.get("icon_id", 0)),
            "Name_Lang_zhCN": str(
                spell.get("name") or resource.official_db.name or resource.model_folder
            ),
            "Description_Lang_zhCN": str(spell.get("description", "")),
        }
        plans.append(
            DBCPlanFile(
                dbc_file="Spell.dbc",
                operations=[
                    DBCPlanOperation(
                        action="add",
                        record_id=int(spell["id"]),
                        reason="新增坐骑召唤法术",
                        fields=spell_fields,
                    )
                ],
            )
        )

    # Item.dbc
    item = resource.dbc.item
    if item and item.get("id"):
        plans.append(
            DBCPlanFile(
                dbc_file="Item.dbc",
                operations=[
                    DBCPlanOperation(
                        action="add",
                        record_id=int(item["id"]),
                        reason="新增物品数据",
                        fields={
                            "ID": int(item["id"]),
                            "ClassID": int(item.get("class", 15)),
                            "SubclassID": int(item.get("subclass", 5)),
                            "Material": int(item.get("material", -1)),
                            "DisplayInfoID": int(item.get("display_id", 0)),
                            "InventoryType": int(item.get("inventory_type", 0)),
                            "SheatheType": int(item.get("sheath", 0)),
                        },
                    )
                ],
            )
        )

    return DBCPlan(
        source_dbc_dir=str(settings.project_root / "data" / "wow-dbc" / "src" / "dbc"),
        output_dbc_dir="output/dbc",
        spell_profile={
            "mount_type": resource.mount_type,
            **spell_profile,
        },
        plans=plans,
    )


def build_sql_plan(resource: Mount) -> SQLPlan:
    """根据坐骑资源生成 SQL 计划。"""
    tables: list[SQLPlanTable] = []

    # creature_model_info
    cmi = resource.db.creature_model_info
    if cmi and cmi.get("display_id"):
        tables.append(
            SQLPlanTable(
                name="creature_model_info",
                operation="insert",
                records=[
                    {
                        "DisplayID": int(cmi["display_id"]),
                        "BoundingRadius": float(cmi.get("bounding_radius", 0.0)),
                        "CombatReach": float(cmi.get("combat_reach", 0.0)),
                        "Gender": int(cmi.get("gender", 2)),
                        "DisplayID_Other_Gender": int(cmi.get("display_id_other_gender", 0)),
                    }
                ],
            )
        )

    # creature_template
    ct = resource.db.creature_template
    if ct and ct.get("entry"):
        tables.append(
            SQLPlanTable(
                name="creature_template",
                operation="insert",
                records=[
                    {
                        "entry": int(ct["entry"]),
                        "name": str(ct.get("name", "")),
                        "modelid1": int(ct.get("modelid1", 0)),
                        "faction": int(ct.get("faction", 35)),
                        "type": int(ct.get("type", 1)),
                        "unit_class": int(ct.get("unit_class", 1)),
                        "unit_flag2": int(ct.get("unit_flag2", 2048)),
                        "bounding_radius": float(ct.get("bounding_radius", 0.0)),
                        "combat_reach": float(ct.get("combat_reach", 0.0)),
                        "gender": int(ct.get("gender", 2)),
                        "display_id_other_gender": int(ct.get("display_id_other_gender", 0)),
                    }
                ],
            )
        )

    # item_template
    it = resource.db.item_template
    spell_id = resource.dbc.spell.get("id") if resource.dbc.spell else None
    if it and it.get("entry"):
        tables.append(
            SQLPlanTable(
                name="item_template",
                operation="insert",
                records=[
                    {
                        "entry": int(it["entry"]),
                        "name": str(it.get("name", "")),
                        "class": int(it.get("class", 15)),
                        "subclass": int(it.get("subclass", 5)),
                        "displayid": int(it.get("displayid", 0)),
                        "spellid_1": int(it.get("spellid_1", 0)),
                        "spelltrigger_1": int(it.get("spelltrigger_1", 0)),
                        "spellcharges_1": int(it.get("spellcharges_1", 0)),
                        "spellid_2": int(spell_id) if spell_id else int(it.get("spellid_2", 0)),
                        "spelltrigger_2": int(it.get("spelltrigger_2", 0)),
                        "spellcharges_2": int(it.get("spellcharges_2", 0)),
                        "Quality": int(it.get("Quality", 4)),
                        "AllowableClass": int(it.get("AllowableClass", -1)),
                        "AllowableRace": int(it.get("AllowableRace", 2047)),
                    }
                ],
            )
        )

    return SQLPlan(
        target_database="acore_world",
        output_sql_file="output/db_patch.sql",
        tables=tables,
    )


def _build_readme(job_id: str, resource: Resource) -> str:
    """生成 input/README.md。"""
    return f"""# Patch Job: {job_id}

本目录由 acore-resouces 系统导出，供 `/build-mount-patch` 等 Skill 使用。

## 资源信息

- 类型：{resource.resource_type}
- ID：{resource.id}
- 名称：{resource.official_db.name or resource.model_folder}
- 模型文件夹：{resource.model_folder}

## 文件说明

- `resource.yaml`: 坐骑完整元数据
- `assets.json`: 客户端资源（.m2/.blp）位置与打包建议
- `dbc-plan.yaml`: 建议修改的 DBC 文件和字段
- `sql-plan.yaml`: 建议生成的 SQL 表和字段

## 工作流程

1. 读取 `resource.yaml` 和 `assets.json`。
2. 检查 `dbc-plan.yaml` 中的 ID 是否冲突。
3. 根据 `mount_type` 调整 Spell.dbc 相关字段。
4. 运行 `patch build` 生成批次 DBC/SQL/MPQ 与校验报告。
"""


def create_patch_job(resource_type: str, resource_id: int) -> PatchJobManifest:
    """为单个资源创建补丁任务。

    Args:
        resource_type: 资源类型，如 mount。
        resource_id: 资源 ID。

    Returns:
        补丁任务 manifest。

    Raises:
        ValueError: 资源不存在或类型不匹配。
    """
    resource = load_resource(resource_type, resource_id)
    if resource is None:
        raise ValueError(f"未找到 {resource_type} ID={resource_id}")
    if resource.resource_type != resource_type:
        raise ValueError(f"资源类型不匹配：期望 {resource_type}，实际 {resource.resource_type}")
    if resource.resource_type != "mount":
        raise ValueError(f"第一阶段仅支持 mount，当前类型 {resource.resource_type}")

    mount = cast(Mount, resource)
    job_id = _build_job_id(resource)
    job_dir = settings.patch_jobs_dir / job_id
    input_dir = job_dir / "input"

    # 固定目录完全重置，避免历史产物与重复目录
    if job_dir.exists():
        shutil.rmtree(job_dir)
    _ensure_dir(input_dir)

    # 写入 resource.yaml
    resource_data = resource.model_dump(exclude_none=False)
    resource_data.pop("created_at", None)
    resource_data.pop("updated_at", None)
    _write_yaml(input_dir / "resource.yaml", resource_data)

    # 写入 assets.json
    assets_json = build_assets_json(resource)
    _write_json(input_dir / "assets.json", assets_json)

    # 写入 dbc-plan.yaml
    dbc_plan = build_dbc_plan(mount)
    _write_yaml(input_dir / "dbc-plan.yaml", dbc_plan.model_dump(exclude_none=False))

    # 写入 sql-plan.yaml
    sql_plan = build_sql_plan(mount)
    _write_yaml(input_dir / "sql-plan.yaml", sql_plan.model_dump(exclude_none=False))

    # 写入 README.md
    _write_text(input_dir / "README.md", _build_readme(job_id, resource))

    # 写入 manifest.json
    manifest = PatchJobManifest(
        job_id=job_id,
        created_at=datetime.now(UTC).isoformat(),
        created_by="system",
        resource_type=resource.resource_type,
        resource_id=resource.id,
        resource_name=resource.official_db.name or resource.model_folder,
        resource_model_folder=resource.model_folder,
        status="requested",
        input_dir="input",
        artifacts=PatchArtifacts(
            input={
                "resource_yaml": "input/resource.yaml",
                "assets_json": "input/assets.json",
                "dbc_plan": "input/dbc-plan.yaml",
                "sql_plan": "input/sql-plan.yaml",
                "readme": "input/README.md",
            },
        ),
    )
    _write_json(job_dir / "manifest.json", manifest.model_dump(exclude_none=False))

    return manifest


def _load_manifest_file(job_dir: Path) -> PatchJobManifest | None:
    """从目录读取 manifest。"""
    manifest_path = job_dir / "manifest.json"
    if not manifest_path.exists():
        return None
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        return PatchJobManifest(**data)
    except (json.JSONDecodeError, ValueError):
        return None


def list_patch_jobs(
    resource_type: str | None = None,
    resource_id: int | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    """列出补丁任务。

    Args:
        resource_type: 按资源类型过滤。
        resource_id: 按资源 ID 过滤。
        status: 按状态过滤。
        page: 页码。
        page_size: 每页数量。

    Returns:
        分页结果。
    """
    _ensure_dir(settings.patch_jobs_dir)
    jobs: list[PatchJobManifest] = []

    for job_dir in sorted(settings.patch_jobs_dir.iterdir(), reverse=True):
        if not job_dir.is_dir():
            continue
        manifest = _load_manifest_file(job_dir)
        if manifest is None:
            continue
        if resource_type and manifest.resource_type != resource_type:
            continue
        if resource_id is not None and manifest.resource_id != resource_id:
            continue
        if status and manifest.status != status:
            continue
        jobs.append(manifest)

    total = len(jobs)
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [j.model_dump(exclude_none=False) for j in jobs[start:end]],
    }


def get_patch_job(job_id: str) -> PatchJobManifest | None:
    """获取单个补丁任务。"""
    job_dir = settings.patch_jobs_dir / job_id
    return _load_manifest_file(job_dir)


def update_patch_job_status(
    job_id: str,
    status: str,
    output_artifacts: dict[str, str] | None = None,
    summary: str | None = None,
) -> PatchJobManifest | None:
    """更新补丁任务状态。

    Args:
        job_id: 任务 ID。
        status: 新状态。
        output_artifacts: 输出产物清单。
        summary: 摘要。

    Returns:
        更新后的 manifest，若任务不存在则返回 None。
    """
    manifest = get_patch_job(job_id)
    if manifest is None:
        return None

    manifest.status = status  # type: ignore[assignment]
    if output_artifacts:
        manifest.artifacts.output = output_artifacts
    if summary:
        manifest.summary = summary
    if status in ("generated", "applied", "failed"):
        manifest.completed_at = datetime.now(UTC).isoformat()

    job_dir = settings.patch_jobs_dir / job_id
    _write_json(job_dir / "manifest.json", manifest.model_dump(exclude_none=False))
    return manifest
