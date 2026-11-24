"""单任务一致性校验。

validate_job 对现场构建的资源 + SQL 计划 + 源 DBC 做跨层一致性检查；
载具/挂件/特性标签相关的主题校验拆至 `_feature_checks`。
"""

from __future__ import annotations

from pathlib import Path

import app.services.mount_patch_builder as _facade

from ._checks import (
    JobValidation,
    ValidationResult,
    _find_sql_record,
    _is_ascii_path,
    _normalize_path,
)
from ._context import JobContext, sanitize_model_folder
from ._feature_checks import (
    _check_accessory_tag_consistency,
    _check_spell_feature_effects,
    _check_vehicle_consistency,
)


def validate_job(ctx: JobContext, mpq_assets: list[Path]) -> JobValidation:
    """对单个任务执行一致性校验，返回校验结果。"""
    resource = ctx.resource
    sql_plan = ctx.sql_plan.model_dump()
    assets = ctx.assets
    mount_name = resource.official_db.name or ctx.job_id

    spell_id = resource.dbc.spell.id
    cmd_id = resource.dbc.creature_model_data.id
    cdi_id = resource.dbc.creature_display_info.id
    visual_id = resource.dbc.spell.visual_id

    ct_entry = resource.db.creature_template.entry
    it_record = _find_sql_record(sql_plan, "item_template") or {}
    it_spellid_2 = it_record.get("spellid_2")
    # AzerothCore 的 creature_template 已无 modelid1 列，显示模型关联由
    # creature_template_model 表（CreatureID ↔ CreatureDisplayID）承担。
    ctm_record = _find_sql_record(sql_plan, "creature_template_model") or {}
    ctm_creature_id = ctm_record.get("CreatureID")
    ctm_display_id = ctm_record.get("CreatureDisplayID")
    cmi_record = _find_sql_record(sql_plan, "creature_model_info") or {}
    cmi_display_id_sql = cmi_record.get("DisplayID") or cmi_record.get("display_id")

    checks: list[ValidationResult] = []

    checks.append(
        ValidationResult(
            name="spell_id_matches_item_template_spellid_2",
            passed=spell_id == it_spellid_2,
            expected=spell_id,
            actual=it_spellid_2,
            message="法术 ID 必须与 item_template.spellid_2 一致",
        )
    )

    cmd_record = _facade._record_by_id(_facade.WOW_DBC_DIR / "CreatureModelData.dbc", cmd_id)
    cdi_record = _facade._record_by_id(_facade.WOW_DBC_DIR / "CreatureDisplayInfo.dbc", cdi_id)
    cdi_model_id = cdi_record.get("ModelID") if cdi_record else None
    checks.append(
        ValidationResult(
            name="creature_model_data_id_matches_display_info_model_id",
            passed=cmd_id is not None and cmd_id == cdi_model_id,
            expected=cmd_id,
            actual=cdi_model_id,
            message="CreatureModelData.ID 必须与 CreatureDisplayInfo.ModelID 一致",
        )
    )

    checks.append(
        ValidationResult(
            name="creature_display_info_id_matches_creature_template_model",
            passed=(
                cdi_id is not None
                and ctm_display_id == cdi_id
                and (ct_entry is None or ctm_creature_id == ct_entry)
            ),
            expected={"CreatureID": ct_entry, "CreatureDisplayID": cdi_id},
            actual={"CreatureID": ctm_creature_id, "CreatureDisplayID": ctm_display_id},
            message=(
                "creature_template_model.CreatureDisplayID 必须与 CreatureDisplayInfo.ID 一致，"
                "CreatureID 必须与 creature_template.entry 一致"
            ),
        )
    )
    checks.append(
        ValidationResult(
            name="creature_display_info_id_matches_creature_model_info_display_id",
            passed=cdi_id is not None and cdi_id == cmi_display_id_sql,
            expected=cdi_id,
            actual=cmi_display_id_sql,
            message="CreatureDisplayInfo.ID 必须与 creature_model_info.display_id 一致",
        )
    )

    checks.append(
        ValidationResult(
            name="creature_template_entry_matches_spell_visual_id",
            passed=ct_entry is not None and ct_entry == visual_id,
            expected=visual_id,
            actual=ct_entry,
            message="creature_template.entry 必须与 spell.visual_id 一致",
        )
    )

    model_name_in_dbc = cmd_record.get("ModelName") if cmd_record else None
    mpq_asset_strs = [str(p) for p in mpq_assets]
    normalized_dbc_path = _normalize_path(model_name_in_dbc or "")

    path_matches = bool(normalized_dbc_path) and any(
        _normalize_path(p) == normalized_dbc_path for p in mpq_asset_strs
    )
    checks.append(
        ValidationResult(
            name="creature_model_data_path_matches_mpq",
            passed=path_matches,
            expected=mpq_asset_strs,
            actual=model_name_in_dbc,
            message="CreatureModelData.dbc 中的模型路径必须与 MPQ 中的实际文件路径一致",
        )
    )

    path_ascii_ok = _is_ascii_path(model_name_in_dbc or "")
    checks.append(
        ValidationResult(
            name="creature_model_data_path_ascii_only",
            passed=path_ascii_ok,
            expected="ASCII 且无空格",
            actual=model_name_in_dbc,
            message="CreatureModelData.dbc 中的模型路径必须全英文、无空格、无中文",
        )
    )

    all_mpq_ascii = all(_is_ascii_path(str(p)) for p in mpq_assets)
    checks.append(
        ValidationResult(
            name="mpq_model_paths_ascii_only",
            passed=all_mpq_ascii,
            expected="所有路径均为 ASCII 且无空格",
            actual=[str(p) for p in mpq_assets if not _is_ascii_path(str(p))],
            message="MPQ 中的模型文件路径包含非 ASCII 或空格；历史补丁中可能存在此类文件",
            severity="warning",
        )
    )

    raw_folder = assets.get("model_folder") or ""
    sanitized = sanitize_model_folder(raw_folder)
    checks.append(
        ValidationResult(
            name="model_folder_sanitized_no_chinese_or_spaces",
            passed=raw_folder == sanitized,
            expected=sanitized,
            actual=raw_folder,
            message="model_folder 清理后不应改变，说明原始值包含中文或空格；脚本已自动清理输出路径",
            severity="warning",
        )
    )

    _check_vehicle_consistency(resource, sql_plan, checks)
    _check_accessory_tag_consistency(resource, resource.vehicle, checks)
    _check_spell_feature_effects(resource, checks)

    passed = all(c.passed or c.severity == "warning" for c in checks)
    return JobValidation(
        job_id=ctx.job_id,
        mount_name=mount_name,
        passed=passed,
        checks=checks,
    )
