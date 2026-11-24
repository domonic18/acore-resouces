"""小宠物补丁计划生成单元测试。

坐骑专属语义（速度光环/特性注入/载具）不适用于宠物；宠物法术走
官方观赏宠物召唤族模板（Effect_1=28 + EffectMiscValueB_1=41）。
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.resource import Pet
from app.services import mount_patch_builder as mpb
from app.services.mount_preview import build_patch_preview
from app.services.patch_exporter import build_dbc_plan, build_sql_plan


@pytest.fixture
def sample_pet() -> Pet:
    """构造一个字段齐全的小宠物资源。"""
    return Pet(
        id=1,
        model_folder="babycow_test",
        official_db={"name": "测试小奶牛"},
        dbc={
            "creature_model_data": {
                "id": 4000,
                "model_name": r"creature\babycow\babycow.m2",
                "model_scale": 1.0,
            },
            "creature_display_info": {
                "id": 140000,
                "model_id": 4000,
                "texture_variation_1": "babycow_white",
            },
            "spell": {
                "id": 80010,
                "name": "测试小奶牛",
                "description": "教你学会召唤这种小伙伴。",
                "icon_id": 3715,
            },
            "item": {
                "id": 91010,
                "class": 15,
                "subclass": 2,
                "display_id": 61228,
            },
        },
        db={
            "creature_template": {"entry": 91001, "name": "测试小奶牛", "faction": 35},
            "creature_model_info": {"display_id": 140000},
            "item_template": {"entry": 91010, "name": "测试小奶牛", "spellid_2": 80010},
        },
        pet_type="小动物",
        rarity="稀有",
    )


def _incomplete_pet() -> Pet:
    """幼鹿形态：仅有 item/浏览元数据，模型与法术链路数据缺失。"""
    return Pet(
        id=5,
        model_folder="fawn_test",
        official_db={"name": "幼鹿"},
        dbc={"item": {"id": 91005, "class": 15, "subclass": 2}},
        db={"item_template": {"entry": 91005}},
    )


def test_build_dbc_plan_pet_spell_fields(sample_pet: Pet) -> None:
    """宠物法术走 SUMMON_PET 模板：无光环叠加，召唤目标挂 creature_template.entry。"""
    plan = build_dbc_plan(sample_pet)
    fields = next(p for p in plan.plans if p.dbc_file == "Spell.dbc").operations[0].fields

    assert fields["Effect_1"] == 28
    assert fields["EffectMiscValueB_1"] == 41
    assert fields["EffectMiscValue_1"] == 91001
    assert fields["ImplicitTargetA_1"] == 32
    # 宠物不做任何光环叠加，速度/特性槽位概念不存在
    assert "EffectAura_1" not in fields
    assert "EffectAura_2" not in fields
    assert "Effect_2" not in fields
    assert "AuraDescription_Lang_deDE" not in fields
    # 模板众数字段与描述
    assert fields["Attributes"] == 262416
    assert fields["DurationIndex"] == 21
    assert fields["StartRecoveryCategory"] == 133
    assert fields["SpellVisualID_1"] == 353
    assert fields["SpellIconID"] == 3715
    assert fields["Name_Lang_deDE"] == "测试小奶牛"
    assert fields["Description_Lang_deDE"] == "教你学会召唤这种小伙伴。"


def test_build_dbc_plan_pet_description_fallback(sample_pet: Pet) -> None:
    """描述为空时使用官方「右键点击以召唤」句式。"""
    sample_pet.dbc.spell.description = None
    fields = (
        next(p for p in build_dbc_plan(sample_pet).plans if p.dbc_file == "Spell.dbc")
        .operations[0]
        .fields
    )
    assert fields["Description_Lang_deDE"] == "右键点击以召唤或解散你的测试小奶牛。"


def test_build_dbc_plan_pet_no_vehicle_blocks(sample_pet: Pet) -> None:
    """宠物计划只含四个共享 DBC 文件，无载具；profile 无 mount_type。"""
    plan = build_dbc_plan(sample_pet)

    assert {p.dbc_file for p in plan.plans} == {
        "CreatureModelData.dbc",
        "CreatureDisplayInfo.dbc",
        "Spell.dbc",
        "Item.dbc",
    }
    assert "mount_type" not in plan.spell_profile
    assert plan.spell_profile["resource_type"] == "pet"
    assert plan.spell_profile["Effect_1"] == 28


def test_build_sql_plan_pet_tables(sample_pet: Pet) -> None:
    """宠物 SQL 计划含共享四表，无载具/点击施法表。"""
    plan = build_sql_plan(sample_pet)
    table_names = {t.name for t in plan.tables}

    assert {
        "creature_model_info",
        "creature_template",
        "creature_template_model",
        "item_template",
    } <= table_names
    assert "npc_spellclick_spells" not in table_names
    assert "vehicle_template_accessory" not in table_names
    ct_record = next(t for t in plan.tables if t.name == "creature_template").records[0]
    # VehicleId 可能以 schema 默认 0 出现，但绝不会是有效载具 ID
    assert not ct_record.get("VehicleId")
    item_record = next(t for t in plan.tables if t.name == "item_template").records[0]
    assert item_record["spellid_2"] == 80010
    ctm_record = next(t for t in plan.tables if t.name == "creature_template_model").records[0]
    assert ctm_record["CreatureID"] == 91001
    assert ctm_record["CreatureDisplayID"] == 140000


def test_build_dbc_plan_incomplete_pet_item_only() -> None:
    """数据不全的宠物（幼鹿形态）只生成 Item.dbc 计划，不抛错。"""
    plan = build_dbc_plan(_incomplete_pet())
    assert [p.dbc_file for p in plan.plans] == ["Item.dbc"]


def test_preview_incomplete_pet_lists_missing_issues() -> None:
    """预检对数据不全宠物如实列出缺失清单（关联链路缺失警告）。"""
    preview = build_patch_preview(_incomplete_pet())
    codes = {issue.code for issue in preview.issues}
    assert {
        "relationship_spell_item",
        "relationship_model_display",
        "relationship_display_template_info",
    } <= codes
    assert all(check.status == "missing" for check in preview.relationships)
    assert len(preview.relationships) == 3


def test_preview_complete_pet_relationships_ok(sample_pet: Pet) -> None:
    """数据齐全宠物三组关联全部命中且一致。"""
    preview = build_patch_preview(sample_pet)
    assert {check.rule.key: check.status for check in preview.relationships} == {
        "spell_item": "ok",
        "model_display": "ok",
        "display_template_info": "ok",
    }


def _write_pet_job_json(job_dir: Path, resource: Pet) -> None:
    """在任务目录写入 pet 类型的 job.json。"""
    job_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "job_id": job_dir.name,
        "created_at": "2026-01-01T00:00:00+00:00",
        "created_by": "test",
        "resource_type": "pet",
        "resource_id": resource.id,
        "resource_name": resource.official_db.name or resource.model_folder,
        "resource_model_folder": resource.model_folder,
        "status": "requested",
    }
    with (job_dir / "job.json").open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False)


def test_generate_sql_writes_to_pet_subdir(
    sample_pet: Pet,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """pet 任务 SQL 写入 pets/{id:04d}_{slug}/ 子目录，文件名带类型。"""
    sql_link_dir = tmp_path / "sql" / "azerothcore-updates"
    sql_link_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(mpb, "SQL_LINK_DIR", sql_link_dir)
    monkeypatch.setattr(mpb, "SQL_MOUNTS_DIR", sql_link_dir / "mounts")
    monkeypatch.setattr(mpb, "ensure_sql_symlink", lambda: None)

    job_dir = tmp_path / "patch-jobs" / "pet_0001"
    _write_pet_job_json(job_dir, sample_pet)
    monkeypatch.setattr("app.services.resource_store.load_resource", lambda t, i: sample_pet)
    ctx = mpb.build_job_context(job_dir)

    written = mpb.generate_sql(ctx)

    assert len(written) == 1
    add_file = written[0]
    assert add_file.parent == sql_link_dir / "pets" / "0001_babycow_test"
    assert add_file.name == "0001_pet_add.sql"

    content = add_file.read_text(encoding="utf-8")
    assert "-- Resource ID: 0001" in content
    assert "自定义小宠物：测试小奶牛" in content
    assert "INSERT INTO `item_template`" in content
