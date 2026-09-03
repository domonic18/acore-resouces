"""补丁计划生成单元测试。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.schemas.resource import DropInfo, Mount
from app.services import mount_patch_builder as mpb
from app.services.patch_exporter import build_assets_json, build_dbc_plan, build_sql_plan


@pytest.fixture
def sample_mount() -> Mount:
    """构造一个样本坐骑资源。"""
    return Mount(
        id=3,
        model_folder="ardenwealdstagmount_test",
        preview_image=None,
        debug_passed=True,
        added=True,
        official_db={
            "name": "测试符文牡鹿",
            "spell_icon_name": "inv_ardenwealdstagmount_blue",
            "icon_name": "inv_ardenwealdstagmount_blue",
        },
        dbc={
            "creature_model_data": {
                "id": 4000,
                "flags": 2,
                "model_name": r"creature\ardenwealdstag\ardenwealdstagmount.m2",
                "model_scale": 1.0,
                "collision_width": 1.0,
                "collision_height": 1.0,
                "mount_height": 1.0,
            },
            "creature_display_info": {
                "id": 140000,
                "model_id": 4000,
                "sound_id": 0,
                "extra_display_information_id": 0,
                "scale": 1.0,
                "opacity": 255,
                "texture_variation_1": "ardenwealdstagmount_blue",
                "texture_variation_2": "",
                "texture_variation_3": "",
            },
            "spell": {
                "id": 80000,
                "name": "测试符文牡鹿",
                "description": "召唤或解散一头测试符文牡鹿。",
                "visual_id": 9140000,
                "icon_id": 14357,
            },
            "item": {
                "id": 91000,
                "class": 15,
                "subclass": 5,
                "material": -1,
                "quality": 4,
                "display_id": 95357,
                "inventory_type": 0,
                "sheath": 0,
            },
        },
        db={
            "creature_template": {
                "entry": 9140000,
                "name": "测试符文牡鹿",
                "faction": 35,
                "type": 1,
                "unit_class": 1,
                "unit_flags2": 2048,
            },
            "creature_model_info": {
                "display_id": 140000,
                "bounding_radius": 0.0,
                "combat_reach": 0.0,
                "gender": 2,
                "display_id_other_gender": 0,
            },
            "item_template": {
                "entry": 91000,
                "name": "测试符文牡鹿",
                "displayid": 95357,
                "spellid_2": 80000,
                "Quality": 4,
                "AllowableClass": -1,
                "AllowableRace": 2047,
            },
        },
        mount_type="陆地坐骑",
        star_rating="三星",
        subtype="鹿",
    )


def test_build_dbc_plan_structure(sample_mount: Mount) -> None:
    """验证 dbc-plan 结构。"""
    plan = build_dbc_plan(sample_mount)

    assert plan.source_dbc_dir.endswith("data/wow-dbc/src/dbc")
    assert plan.output_dbc_dir == "output/dbc"
    assert plan.spell_profile["mount_type"] == "陆地坐骑"

    dbc_files = {p.dbc_file for p in plan.plans}
    assert dbc_files == {
        "CreatureModelData.dbc",
        "CreatureDisplayInfo.dbc",
        "Spell.dbc",
        "Item.dbc",
    }
    item_op = next(p for p in plan.plans if p.dbc_file == "Item.dbc").operations[0]
    assert item_op.fields["Sound_override_subclassID"] == -1
    cmd_op = next(p for p in plan.plans if p.dbc_file == "CreatureModelData.dbc").operations[0]
    assert cmd_op.fields["BloodID"] == 3
    assert cmd_op.fields["AttachedEffectScale"] == 1.0


def test_collect_dbc_operations_preserves_yaml_model_name(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """CMD ModelName 采用 YAML 显式值透传，不做代码推导覆盖。"""
    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    ctx = _make_job_context(job_dir, sample_mount, monkeypatch)

    grouped = mpb.collect_dbc_operations([ctx])
    cmd_ops = grouped["CreatureModelData.dbc"]
    assert len(cmd_ops) == 1
    _, op = cmd_ops[0]
    # model_folder=ardenwealdstagmount_test 与 model_name 的目录段 ardenwealdstag
    # 刻意不同：若发生推导覆盖，此处会变成 creature\ardenwealdstagmount_test\...
    assert op["fields"]["ModelName"] == r"creature\ardenwealdstag\ardenwealdstagmount.m2"


def test_build_dbc_plan_spell_fields(sample_mount: Mount) -> None:
    """验证 Spell.dbc 字段按 MCC 实测模板生成（挂载生物走 EffectMiscValue_1）。"""
    plan = build_dbc_plan(sample_mount)
    spell_plan = next(p for p in plan.plans if p.dbc_file == "Spell.dbc")
    op = spell_plan.operations[0]

    assert op.action == "add"
    assert op.record_id == 80000
    assert op.fields["ID"] == 80000
    assert op.fields["Mechanic"] == 21
    assert op.fields["EffectAura_1"] == 78
    assert op.fields["EffectMiscValue_1"] == 9140000
    assert op.fields["EffectAura_2"] == 32
    assert op.fields["EffectBasePoints_2"] == 99
    assert op.fields["SpellVisualID_1"] == 5160
    assert op.fields["Name_Lang_deDE"] == "测试符文牡鹿"
    # 逐字段核对自 live 的模板补全字段（Q10）
    assert op.fields["Attributes"] == 269844752
    assert op.fields["AttributesExC"] == 536870912
    assert op.fields["AttributesExF"] == 131072
    assert op.fields["InterruptFlags"] == 31
    assert op.fields["ProcChance"] == 101
    assert op.fields["DurationIndex"] == 21
    assert op.fields["RangeIndex"] == 1
    assert op.fields["EquippedItemClass"] == -1
    assert op.fields["EquippedItemSubclass"] == 1
    assert op.fields["ImplicitTargetA_2"] == 1
    assert op.fields["NameSubtext_Lang_Mask"] == 16712190
    assert op.fields["Description_Lang_Mask"] == 16712190
    assert op.fields["AuraDescription_Lang_deDE"] == "速度提高$s2%。"
    assert op.fields["AuraDescription_Lang_Mask"] == 16712190
    assert op.fields["EffectChainAmplitude_1"] == 1.0
    assert op.fields["SchoolMask"] == 1
    # 历史字段 visual_id 存的是生物 entry，绝不写入 SpellVisualID_1
    assert "EffectBasePoints_1" not in op.fields
    assert "EffectSpellClassMaskC_3" not in op.fields


def test_build_dbc_plan_spell_visual_id_override() -> None:
    """YAML spell_visual_id 覆盖 SpellVisualID_1（visual_id 仍走 EffectMiscValue_1）。"""
    mount = Mount(
        id=6,
        model_folder="visual_override_test",
        official_db={"name": "视觉覆盖测试"},
        dbc={
            "creature_model_data": {"id": 4003, "model_name": "test.m2"},
            "creature_display_info": {"id": 140003, "model_id": 4003},
            "spell": {
                "id": 80003,
                "name": "视觉覆盖测试",
                "visual_id": 9140006,
                "spell_visual_id": 12844,
            },
            "item": {"id": 91003, "class": 15, "subclass": 5},
        },
        db={"creature_template": {"entry": 9140006}},
        mount_type="飞行坐骑",
    )
    plan = build_dbc_plan(mount)
    fields = next(p for p in plan.plans if p.dbc_file == "Spell.dbc").operations[0].fields
    assert fields["SpellVisualID_1"] == 12844
    assert fields["EffectMiscValue_1"] == 9140006


def test_build_dbc_plan_flying_aura_description() -> None:
    """飞行坐骑模板：飞行光环文本、语言掩码与额外效果字段。"""
    mount = Mount(
        id=4,
        model_folder="flying_test",
        official_db={"name": "飞行测试"},
        dbc={
            "creature_model_data": {"id": 4001, "model_name": "test.m2"},
            "creature_display_info": {"id": 140001, "model_id": 4001},
            "spell": {"id": 80001, "name": "飞行测试"},
            "item": {"id": 91001, "class": 15, "subclass": 5},
        },
        db={"creature_template": {"entry": 9140001}},
        mount_type="飞行坐骑",
    )
    plan = build_dbc_plan(mount)
    fields = next(p for p in plan.plans if p.dbc_file == "Spell.dbc").operations[0].fields
    assert fields["AuraDescription_Lang_deDE"] == "飞行速度提高$s2%。"
    assert fields["AuraDescription_Lang_Mask"] == 16712188
    assert fields["NameSubtext_Lang_Mask"] == 16712188
    assert fields["StartRecoveryCategory"] == 133
    assert fields["ImplicitTargetA_3"] == 1
    assert fields["EffectBonusCoefficient_2"] == 1.0
    assert fields["EffectBonusCoefficient_3"] == 1.0
    assert "EquippedItemSubclass" not in fields


def test_build_dbc_plan_water_mount() -> None:
    """水上坐骑模板：水上行走光环、ExcludeCasterAuraSpell，且不写 Effect_3。"""
    mount = Mount(
        id=7,
        model_folder="water_test",
        official_db={"name": "水上测试"},
        dbc={
            "creature_model_data": {"id": 4004, "model_name": "test.m2"},
            "creature_display_info": {"id": 140004, "model_id": 4004},
            "spell": {"id": 80004, "name": "水上测试"},
            "item": {"id": 91004, "class": 15, "subclass": 5},
        },
        db={"creature_template": {"entry": 9140007}},
        mount_type="水上坐骑",
    )
    plan = build_dbc_plan(mount)
    fields = next(p for p in plan.plans if p.dbc_file == "Spell.dbc").operations[0].fields
    assert fields["EffectBasePoints_1"] == -1
    assert fields["EffectAura_2"] == 58
    assert fields["EffectBasePoints_2"] == 59
    assert fields["EffectBasePoints_3"] == -1
    assert fields["ExcludeCasterAuraSpell"] == 44521
    assert fields["AuraDescription_Lang_deDE"] == "游泳速度提高$s2%。"
    assert fields["AuraDescription_Lang_Mask"] == 16712190
    assert fields.get("Effect_3", 0) != 6


def test_build_dbc_plan_description_autogenerated() -> None:
    """描述为空时按 mount_type 自动生成。"""
    mount = Mount(
        id=8,
        model_folder="no_desc_test",
        official_db={"name": "无描述测试"},
        dbc={
            "creature_model_data": {"id": 4005, "model_name": "test.m2"},
            "creature_display_info": {"id": 140005, "model_id": 4005},
            "spell": {"id": 80005, "name": "无描述测试"},
            "item": {"id": 91005, "class": 15, "subclass": 5},
        },
        db={"creature_template": {"entry": 9140008}},
        mount_type="飞行坐骑",
    )
    plan = build_dbc_plan(mount)
    fields = next(p for p in plan.plans if p.dbc_file == "Spell.dbc").operations[0].fields
    assert fields["Description_Lang_deDE"] == (
        "召唤或解散一只可供骑乘的无描述测试。只能在外域或诺森德召唤这种坐骑。"
    )


def test_build_dbc_plan_flying_mount() -> None:
    """验证飞行坐骑模板：ExD 标志位、飞行光环与默认 280% 速度档。"""
    mount = Mount(
        id=4,
        model_folder="flying_test",
        official_db={"name": "飞行测试"},
        dbc={
            "creature_model_data": {"id": 4001, "model_name": "test.m2"},
            "creature_display_info": {"id": 140001, "model_id": 4001},
            "spell": {"id": 80001, "name": "飞行测试"},
            "item": {"id": 91001, "class": 15, "subclass": 5},
        },
        db={"creature_template": {"entry": 9140001}},
        mount_type="飞行坐骑",
    )
    plan = build_dbc_plan(mount)
    spell_plan = next(p for p in plan.plans if p.dbc_file == "Spell.dbc")
    fields = spell_plan.operations[0].fields
    assert fields["AttributesExD"] == 67108864
    assert fields["EffectAura_2"] == 207
    assert fields["EffectBasePoints_2"] == 279
    assert fields["EffectAura_3"] == 32
    assert fields["EffectBasePoints_3"] == 99


def test_build_dbc_plan_flying_speed_override() -> None:
    """YAML flight_speed=310 时 EffectBasePoints_2 应为 309。"""
    mount = Mount(
        id=5,
        model_folder="flying_310_test",
        official_db={"name": "极速飞行测试"},
        dbc={
            "creature_model_data": {"id": 4002, "model_name": "test.m2"},
            "creature_display_info": {"id": 140002, "model_id": 4002},
            "spell": {"id": 80002, "name": "极速飞行测试", "flight_speed": 310},
            "item": {"id": 91002, "class": 15, "subclass": 5},
        },
        db={"creature_template": {"entry": 9140002}},
        mount_type="飞行坐骑",
    )
    plan = build_dbc_plan(mount)
    spell_plan = next(p for p in plan.plans if p.dbc_file == "Spell.dbc")
    assert spell_plan.operations[0].fields["EffectBasePoints_2"] == 309


def test_build_sql_plan_structure(sample_mount: Mount) -> None:
    """验证 sql-plan 结构。"""
    plan = build_sql_plan(sample_mount)

    assert plan.target_database == "acore_world"
    assert plan.output_sql_file == "output/db_patch.sql"

    table_names = {t.name for t in plan.tables}
    assert table_names == {
        "creature_model_info",
        "creature_template",
        "creature_template_model",
        "item_template",
    }


def test_build_sql_plan_creature_template_model(sample_mount: Mount) -> None:
    """creature_template_model 关联 creature_template.entry 与 creature_display_info.id。"""
    plan = build_sql_plan(sample_mount)
    ctm_table = next(t for t in plan.tables if t.name == "creature_template_model")
    record = ctm_table.records[0]

    assert record["CreatureID"] == 9140000
    assert record["CreatureDisplayID"] == 140000
    assert record["Idx"] == 0
    assert record["DisplayScale"] == 1.0
    assert record["Probability"] == 1.0
    assert record["VerifiedBuild"] == 0


def test_build_sql_plan_mount_spell_defaults(sample_mount: Mount) -> None:
    """坐骑物品 spellid_1=55884、spelltrigger_2=6 等 mount 默认值被强制填充。"""
    plan = build_sql_plan(sample_mount)
    item_table = next(t for t in plan.tables if t.name == "item_template")
    record = item_table.records[0]

    assert record["spellid_1"] == 55884
    assert record["spelltrigger_2"] == 6
    assert record["spellcharges_1"] == -1
    assert record["spellcooldown_1"] == -1
    assert record["spellcategory_1"] == 330
    assert record["spellcategorycooldown_1"] == 3000
    assert record["spellcooldown_2"] == -1
    assert record["spellcategorycooldown_2"] == -1


def test_build_sql_plan_creature_template_batch1_fields(sample_mount: Mount) -> None:
    """creature_template 输出包含 batch1 写入的所有非默认字段。"""
    plan = build_sql_plan(sample_mount)
    ct_table = next(t for t in plan.tables if t.name == "creature_template")
    record = ct_table.records[0]

    assert record["entry"] == 9140000
    assert record["name"] == "测试符文牡鹿"
    assert record["faction"] == 35
    assert record["type"] == 1
    assert record["unit_class"] == 1
    assert record["unit_flags2"] == 2048
    # 新增的 batch1 默认字段
    assert record["minlevel"] == 1
    assert record["maxlevel"] == 2
    assert record["speed_walk"] == 1.0
    assert record["speed_run"] == 1.14286
    assert record["speed_swim"] == 1.0
    assert record["speed_flight"] == 1.0
    assert record["detection_range"] == 1.0
    assert record["HoverHeight"] == 1.0
    assert record["DamageModifier"] == 1.0
    assert record["HealthModifier"] == 1.0
    assert record["ManaModifier"] == 1.0
    assert record["ArmorModifier"] == 1.0
    assert record["ExperienceModifier"] == 1.0
    assert record["RegenHealth"] == 1
    assert record["flags_extra"] == 2


def test_build_sql_plan_item_template_batch1_fields(sample_mount: Mount) -> None:
    """item_template 输出包含 batch1 写入的所有非默认字段。"""
    plan = build_sql_plan(sample_mount)
    item_table = next(t for t in plan.tables if t.name == "item_template")
    record = item_table.records[0]

    assert record["entry"] == 91000
    assert record["class"] == 15
    assert record["subclass"] == 5
    assert record["displayid"] == 95357
    assert record["Quality"] == 4
    assert record["AllowableClass"] == -1
    assert record["AllowableRace"] == 2047
    # 新增的 batch1 默认字段
    assert record["BuyCount"] == 1
    assert record["BuyPrice"] == 1000000
    assert record["SellPrice"] == 250000
    assert record["InventoryType"] == 0
    assert record["ItemLevel"] == 40
    assert record["RequiredLevel"] == 40
    assert record["RequiredSkill"] == 762
    assert record["RequiredSkillRank"] == 150
    assert record["bonding"] == 1
    assert record["Material"] == 4
    assert record["sheath"] == 0
    assert record["stackable"] == 1
    assert record["description"] == " 教你学会召唤这种坐骑。这是一种非常快速的坐骑。"


def test_build_sql_plan_respects_yaml_overrides_for_new_fields(sample_mount: Mount) -> None:
    """YAML 中显式设置的新字段应保留用户值，而非使用默认。"""
    sample_mount.db.creature_template.speed_run = 1.0  # 慢速坐骑
    sample_mount.db.creature_template.flags_extra = 0
    sample_mount.db.item_template.RequiredSkillRank = 75  # 初级骑术
    sample_mount.db.item_template.BuyPrice = 500000

    plan = build_sql_plan(sample_mount)
    ct_record = next(t for t in plan.tables if t.name == "creature_template").records[0]
    it_record = next(t for t in plan.tables if t.name == "item_template").records[0]

    assert ct_record["speed_run"] == 1.0
    assert ct_record["flags_extra"] == 0
    assert it_record["RequiredSkillRank"] == 75
    assert it_record["BuyPrice"] == 500000


def test_build_sql_plan_item_spell_link(sample_mount: Mount) -> None:
    """验证 item_template.spellid_2 链接到 spell.id。"""
    plan = build_sql_plan(sample_mount)
    item_table = next(t for t in plan.tables if t.name == "item_template")
    record = item_table.records[0]

    assert record["spellid_2"] == 80000


def test_build_assets_json(sample_mount: Mount) -> None:
    """验证 assets.json 结构。"""
    assets = build_assets_json(sample_mount)

    assert assets["resource_type"] == "mount"
    assert assets["resource_id"] == 3
    assert assets["model_folder"] == "ardenwealdstagmount_test"
    assert "m2_files" in assets
    assert "blp_files" in assets
    assert "texture_variations" in assets
    # 测试资源目录不存在
    assert assets["exists"] is False


def test_dbc_plan_yaml_roundtrip(sample_mount: Mount, tmp_path: Path) -> None:
    """验证 dbc-plan 可以序列化为 YAML 并反序列化。"""
    plan = build_dbc_plan(sample_mount)
    path = tmp_path / "dbc-plan.yaml"
    with path.open("w", encoding="utf-8") as f:
        yaml.dump(plan.model_dump(exclude_none=False), f, allow_unicode=True, sort_keys=False)

    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    assert data["plans"][0]["dbc_file"] == "CreatureModelData.dbc"
    assert data["plans"][2]["operations"][0]["fields"]["Mechanic"] == 21


# ---------------------------------------------------------------------------
# Loot SQL 生成（DropInfo -> creature_loot_template）
# ---------------------------------------------------------------------------


def test_build_sql_plan_includes_loot_when_drop_entry_present(sample_mount: Mount) -> None:
    """DropInfo.entry 存在时生成 creature_loot_template 表。"""
    sample_mount.drop = DropInfo(entry=1853, instance="通灵学院", boss="黑暗院长加丁", rate=0.01)
    plan = build_sql_plan(sample_mount)

    loot_table = next((t for t in plan.tables if t.name == "creature_loot_template"), None)
    assert loot_table is not None
    record = loot_table.records[0]
    assert record["Entry"] == 1853
    assert record["Item"] == 91000
    # rate=0.01 (1%) 转换为 SQL Chance 字段时乘以 100 → 1.0
    assert record["Chance"] == 1.0
    assert record["MinCount"] == 1
    assert record["MaxCount"] == 1


def test_build_sql_plan_skips_loot_when_drop_entry_missing(sample_mount: Mount) -> None:
    """DropInfo.entry 缺失时不生成 creature_loot_template。"""
    sample_mount.drop = DropInfo()
    plan = build_sql_plan(sample_mount)

    loot_table = next((t for t in plan.tables if t.name == "creature_loot_template"), None)
    assert loot_table is None


def test_build_sql_plan_loot_default_chance_when_rate_missing(sample_mount: Mount) -> None:
    """DropInfo.rate 缺失时使用 100.0 作为默认 Chance。"""
    sample_mount.drop = DropInfo(entry=1853)
    plan = build_sql_plan(sample_mount)

    loot_table = next(t for t in plan.tables if t.name == "creature_loot_template")
    assert loot_table.records[0]["Chance"] == 100.0


def test_build_sql_plan_loot_chance_percent_conversion(sample_mount: Mount) -> None:
    """DropInfo.rate=0.035 (3.5%) 转换为 SQL Chance 字段时为精确的 3.5（无浮点噪声）。"""
    sample_mount.drop = DropInfo(entry=1853, rate=0.035)
    plan = build_sql_plan(sample_mount)

    loot_table = next(t for t in plan.tables if t.name == "creature_loot_template")
    assert loot_table.records[0]["Chance"] == 3.5
    assert repr(loot_table.records[0]["Chance"]) == "3.5"


# ---------------------------------------------------------------------------
# generate_sql：单 job 子目录写入
# ---------------------------------------------------------------------------


def _write_job_json(job_dir: Path, resource: Mount) -> None:
    """在任务目录写入 job.json 元数据。"""
    job_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "job_id": job_dir.name,
        "created_at": "2026-01-01T00:00:00+00:00",
        "created_by": "test",
        "resource_type": "mount",
        "resource_id": resource.id,
        "resource_name": resource.official_db.name or resource.model_folder,
        "resource_model_folder": resource.model_folder,
        "status": "requested",
    }
    with (job_dir / "job.json").open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False)


def _make_job_context(
    job_dir: Path,
    resource: Mount,
    monkeypatch: pytest.MonkeyPatch,
) -> mpb.JobContext:
    """构造测试用 patch job 目录并现场构建 JobContext。"""
    _write_job_json(job_dir, resource)
    monkeypatch.setattr("app.services.resource_store.load_resource", lambda t, i: resource)
    return mpb.build_job_context(job_dir)


def _patch_sql_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    """把 mount_patch_builder 的 SQL 输出目录指向 tmp_path。"""
    sql_link_dir = tmp_path / "sql" / "azerothcore-updates"
    sql_mounts_dir = sql_link_dir / "mounts"
    sql_link_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(mpb, "SQL_LINK_DIR", sql_link_dir)
    monkeypatch.setattr(mpb, "SQL_MOUNTS_DIR", sql_mounts_dir)
    monkeypatch.setattr(mpb, "ensure_sql_symlink", lambda: None)
    return sql_link_dir, sql_mounts_dir


def test_generate_sql_writes_to_mount_subdir(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """单 job 调用 generate_sql 写入 mounts/{id:04d}_{slug}/ 子目录。"""
    _, sql_mounts_dir = _patch_sql_dirs(tmp_path, monkeypatch)

    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    ctx = _make_job_context(job_dir, sample_mount, monkeypatch)

    written = mpb.generate_sql(ctx)

    assert len(written) == 1
    add_file = written[0]
    assert add_file.parent == sql_mounts_dir / "0003_ardenwealdstagmount_test"
    assert add_file.name == "0003_mount_add.sql"

    content = add_file.read_text(encoding="utf-8")
    assert "INSERT INTO `item_template`" in content
    assert "INSERT INTO `creature_template`" in content
    assert "INSERT INTO `creature_model_info`" in content


def test_generate_sql_writes_loot_when_drop_present(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """DropInfo.entry 存在时同时生成 _mount_add.sql 与 _mount_loot.sql。"""
    _, sql_mounts_dir = _patch_sql_dirs(tmp_path, monkeypatch)
    sample_mount.drop = DropInfo(entry=1853, instance="通灵学院", boss="黑暗院长加丁", rate=0.01)

    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    ctx = _make_job_context(job_dir, sample_mount, monkeypatch)

    written = mpb.generate_sql(ctx)

    assert len(written) == 2
    add_file, loot_file = written
    assert add_file.name == "0003_mount_add.sql"
    assert loot_file.name == "0003_mount_loot.sql"
    assert add_file.parent == loot_file.parent

    loot_content = loot_file.read_text(encoding="utf-8")
    assert "INSERT INTO `creature_loot_template`" in loot_content
    assert "`Entry` = 1853 AND `Item` = 91000" in loot_content

    # add.sql 不应包含 loot 表
    add_content = add_file.read_text(encoding="utf-8")
    assert "creature_loot_template" not in add_content


def test_generate_sql_skips_when_item_entry_exists(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """item_template entry 已在历史 SQL 中时跳过生成。"""
    sql_link_dir, sql_mounts_dir = _patch_sql_dirs(tmp_path, monkeypatch)

    historical = sql_link_dir / "2024_01_01_00_mcc_custom_mounts_batch1.sql"
    historical.write_text(
        "INSERT INTO `item_template` (`entry`, `name`) VALUES (91000, '历史坐骑');",
        encoding="utf-8",
    )

    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    ctx = _make_job_context(job_dir, sample_mount, monkeypatch)

    written = mpb.generate_sql(ctx)

    assert written == []
    assert not (sql_mounts_dir / "0003_ardenwealdstagmount_test").exists()


def test_collect_existing_sql_entries_scans_subdirs(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """_collect_existing_sql_entries 递归扫描根目录历史批次与 mounts/ 子目录。"""
    sql_link_dir, sql_mounts_dir = _patch_sql_dirs(tmp_path, monkeypatch)

    (sql_link_dir / "2024_01_01_00_mcc_custom_mounts_batch1.sql").write_text(
        "INSERT INTO `item_template` (`entry`) VALUES (91000);",
        encoding="utf-8",
    )
    sub = sql_mounts_dir / "0005_other_mount"
    sub.mkdir(parents=True)
    (sub / "0005_mount_add.sql").write_text(
        "INSERT INTO `item_template` (`entry`) VALUES (91005);",
        encoding="utf-8",
    )

    entries = mpb._collect_existing_sql_entries()
    assert 91000 in entries
    assert 91005 in entries


def test_generate_sql_dry_run_returns_expected_paths(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """dry_run 模式下返回预期路径但不创建文件。"""
    _, sql_mounts_dir = _patch_sql_dirs(tmp_path, monkeypatch)
    sample_mount.drop = DropInfo(entry=1853, rate=0.02)

    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    ctx = _make_job_context(job_dir, sample_mount, monkeypatch)

    written = mpb.generate_sql(ctx, dry_run=True)

    assert len(written) == 2
    assert all(not f.exists() for f in written)
    assert written[0].name == "0003_mount_add.sql"
    assert written[1].name == "0003_mount_loot.sql"


# ---------------------------------------------------------------------------
# JobContext：现场读取真相源（重构核心价值回归测试）
# ---------------------------------------------------------------------------


def test_build_job_context_reads_latest_values(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """资源变更后重新构建上下文，计划应反映最新值（无快照滞留）。"""
    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    ctx1 = _make_job_context(job_dir, sample_mount, monkeypatch)
    assert mpb._job_item_entry(ctx1) == 91000

    sample_mount.db.item_template.entry = 91999
    monkeypatch.setattr("app.services.resource_store.load_resource", lambda t, i: sample_mount)
    ctx2 = mpb.build_job_context(job_dir)
    assert mpb._job_item_entry(ctx2) == 91999


def test_build_job_context_missing_resource_raises(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """job.json 引用的资源不存在时抛出 MountPatchBuilderError。"""
    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    _write_job_json(job_dir, sample_mount)
    monkeypatch.setattr("app.services.resource_store.load_resource", lambda t, i: None)

    with pytest.raises(mpb.MountPatchBuilderError):
        mpb.build_job_context(job_dir)


def test_dry_run_dumps_plans(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """dry-run 把计划写入任务目录 plans/，清理函数可移除遗留 plans/。"""
    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    ctx = _make_job_context(job_dir, sample_mount, monkeypatch)

    mpb._dump_plans([ctx])
    plans_dir = job_dir / "plans"
    assert (plans_dir / "dbc-plan.yaml").exists()
    assert (plans_dir / "sql-plan.yaml").exists()
    assert (plans_dir / "assets.json").exists()

    mpb._clear_plans([ctx])
    assert not plans_dir.exists()


def test_apply_dbc_operations_force_rewrites_existing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """force=True 时已存在记录按计划重写；默认跳过保护历史数据。"""
    import shutil as sh

    from wow_dbc_tool import DBCFile

    dbc_dir = tmp_path / "dbc"
    dbc_dir.mkdir()
    sh.copy2(mpb.WOW_DBC_DIR / "CreatureModelData.dbc", dbc_dir / "CreatureModelData.dbc")
    monkeypatch.setattr(mpb, "WOW_DBC_DIR", dbc_dir)

    fields: dict[str, Any] = {
        "ID": 499999,
        "Flags": 2,
        "ModelName": r"creature\test\force_check.m2",
        "ModelScale": 1.0,
        "BloodID": 1,
        "CollisionWidth": 0.6111,
        "CollisionHeight": 2.031,
        "MountHeight": 0.0,
        "AttachedEffectScale": 1.0,
    }

    def _ops(blood_id: int) -> dict[str, list[tuple[None, dict[str, Any]]]]:
        return {
            "CreatureModelData.dbc": [
                (
                    None,
                    {
                        "action": "add",
                        "record_id": 499999,
                        "fields": {**fields, "BloodID": blood_id},
                    },
                )
            ]
        }

    def _blood_id() -> int | None:
        dbc = DBCFile(dbc_dir / "CreatureModelData.dbc")
        dbc.load()
        rec = dbc.get(ID=499999)
        return rec.to_dict()["BloodID"] if rec else None

    mpb.apply_dbc_operations(_ops(1))
    assert _blood_id() == 1
    # 默认：已存在记录跳过，值不被覆盖
    mpb.apply_dbc_operations(_ops(3))
    assert _blood_id() == 1
    # force：已存在记录按计划重写
    mpb.apply_dbc_operations(_ops(3), force=True)
    assert _blood_id() == 3


def test_validate_job_checks_creature_template_model_link(
    sample_mount: Mount,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """显示信息校验基于 creature_template_model 关联（AC 已无 modelid1 列）。"""
    job_dir = tmp_path / "patch-jobs" / "mount_0003"
    ctx = _make_job_context(job_dir, sample_mount, monkeypatch)

    result = mpb.validate_job(ctx, [])

    names = [c.name for c in result.checks]
    assert "creature_display_info_id_matches_creature_template_model" in names
    assert "creature_display_info_id_matches_creature_template_modelid1" not in names
    check = next(
        c
        for c in result.checks
        if c.name == "creature_display_info_id_matches_creature_template_model"
    )
    assert check.passed is True
    assert check.expected == {"CreatureID": 9140000, "CreatureDisplayID": 140000}
