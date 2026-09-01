"""补丁任务元数据导出服务。

补丁任务目录仅包含轻量的 job.json（任务元数据与状态），
资源定义的唯一真相源始终是 data/resources/ 下的 YAML 文件；
DBC/SQL 计划由补丁构建阶段（mount_patch_builder）现场从真相源生成，
本模块只提供 build_dbc_plan / build_sql_plan / build_assets_json 三个纯函数。

同时提供补丁任务的查询和状态更新能力。
"""

from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.preview.asset_resolver import resolve_resource_assets
from app.schemas.patch import (
    DBCPlan,
    DBCPlanFile,
    DBCPlanOperation,
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


def _write_json(path: Path, data: dict[str, Any]) -> None:
    """写入 JSON 文件。"""
    _ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


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
        "model_name": resource.dbc.creature_model_data.model_name,
        "texture_variations": [
            resource.dbc.creature_display_info.model_dump().get(f"texture_variation_{i}")
            for i in (1, 2, 3)
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
    cmd = resource.dbc.creature_model_data.model_dump(exclude_none=True)
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
    cdi = resource.dbc.creature_display_info.model_dump(exclude_none=True)
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
    spell = resource.dbc.spell.model_dump(exclude_none=True)
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
    item = resource.dbc.item.model_dump(by_alias=True, exclude_none=True)
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
    cmi = resource.db.creature_model_info.model_dump(exclude_none=True)
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
    ct = resource.db.creature_template.model_dump(exclude_none=True)
    if ct and ct.get("entry"):
        # 保持 entry 在首位，便于阅读；其余字段顺序由 YAML 决定。
        ct_record: dict[str, Any] = {"entry": int(ct["entry"])}
        for key, value in ct.items():
            if key == "entry":
                continue
            ct_record[key] = value
        tables.append(
            SQLPlanTable(
                name="creature_template",
                operation="insert",
                records=[ct_record],
            )
        )

    # item_template
    it_full = resource.db.item_template.model_dump(by_alias=True, exclude_none=False)
    spell_id = resource.dbc.spell.id if resource.dbc.spell.id else None
    if it_full and it_full.get("entry"):
        # spellid_2 默认从 dbc.spell.id 推导；若 YAML 已显式填写则保留 YAML 值。
        if spell_id and not it_full.get("spellid_2"):
            it_full["spellid_2"] = int(spell_id)
        # entry 置首，过滤 None 字段
        it_record: dict[str, Any] = {"entry": int(it_full["entry"])}
        for key, value in it_full.items():
            if key == "entry":
                continue
            if value is None:
                continue
            it_record[key] = value
        tables.append(
            SQLPlanTable(
                name="item_template",
                operation="insert",
                records=[it_record],
            )
        )

    # creature_template_model：CreatureID 与 creature_template.entry 一一对应，
    # 单显示模型固定 Idx=0；DisplayScale/Probability=1.0，VerifiedBuild=0。
    cdi_id = resource.dbc.creature_display_info.id
    if ct and ct.get("entry") and cdi_id:
        tables.append(
            SQLPlanTable(
                name="creature_template_model",
                operation="insert",
                records=[
                    {
                        "CreatureID": int(ct["entry"]),
                        "Idx": 0,
                        "CreatureDisplayID": int(cdi_id),
                        "DisplayScale": 1.0,
                        "Probability": 1.0,
                        "VerifiedBuild": 0,
                    }
                ],
            )
        )

    # creature_loot_template（仅当 DropInfo 提供掉落来源 entry 时生成）
    # DropInfo.rate 为小数表示（0.01 = 1%），而 creature_loot_template.Chance
    # 字段是 0-100 的百分比（参考 LootMgr.cpp:318 _chance >= 100.0f 视为必掉），
    # 因此生成 SQL 时需把 rate 乘以 100。
    drop = resource.drop
    if drop and drop.entry and it_full and it_full.get("entry"):
        item_entry = int(it_full["entry"])
        chance = drop.rate * 100.0 if drop.rate is not None else 100.0
        tables.append(
            SQLPlanTable(
                name="creature_loot_template",
                operation="insert",
                records=[
                    {
                        "Entry": int(drop.entry),
                        "Item": item_entry,
                        "Reference": 0,
                        "Chance": chance,
                        "QuestRequired": 0,
                        "LootMode": 1,
                        "GroupId": 0,
                        "MinCount": 1,
                        "MaxCount": 1,
                    }
                ],
            )
        )

    return SQLPlan(
        target_database="acore_world",
        output_sql_file="output/db_patch.sql",
        tables=tables,
    )


def create_patch_job(resource_type: str, resource_id: int) -> PatchJobManifest:
    """为单个资源创建补丁任务。

    任务目录仅写入 job.json 元数据；资源定义以 data/resources/ 下的
    YAML 为唯一真相源，构建阶段现场读取。

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

    job_id = _build_job_id(resource)
    job_dir = settings.patch_jobs_dir / job_id

    # 固定目录完全重置，避免历史产物与重复目录
    if job_dir.exists():
        shutil.rmtree(job_dir)
    _ensure_dir(job_dir)

    manifest = PatchJobManifest(
        job_id=job_id,
        created_at=datetime.now(UTC).isoformat(),
        created_by="system",
        resource_type=resource.resource_type,
        resource_id=resource.id,
        resource_name=resource.official_db.name or resource.model_folder,
        resource_model_folder=resource.model_folder,
        status="requested",
    )
    _write_json(job_dir / "job.json", manifest.model_dump(exclude_none=False))

    return manifest


def _load_manifest_file(job_dir: Path) -> PatchJobManifest | None:
    """从任务目录读取 job.json。"""
    manifest_path = job_dir / "job.json"
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
    manifest.updated_at = datetime.now(UTC).isoformat()
    if status in ("generated", "applied", "failed"):
        manifest.completed_at = datetime.now(UTC).isoformat()

    job_dir = settings.patch_jobs_dir / job_id
    _write_json(job_dir / "job.json", manifest.model_dump(exclude_none=False))
    return manifest
