"""补丁计划生成单元测试。"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.schemas.resource import Mount
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
                "modelid1": 140000,
                "faction": 35,
                "type": 1,
                "unit_class": 1,
                "unit_flag2": 2048,
                "bounding_radius": 0.0,
                "combat_reach": 0.0,
                "gender": 2,
                "display_id_other_gender": 0,
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
    assert dbc_files == {"CreatureModelData.dbc", "CreatureDisplayInfo.dbc", "Spell.dbc", "Item.dbc"}


def test_build_dbc_plan_spell_fields(sample_mount: Mount) -> None:
    """验证 Spell.dbc 字段。"""
    plan = build_dbc_plan(sample_mount)
    spell_plan = next(p for p in plan.plans if p.dbc_file == "Spell.dbc")
    op = spell_plan.operations[0]

    assert op.action == "add"
    assert op.record_id == 80000
    assert op.fields["ID"] == 80000
    assert op.fields["Mechanic"] == 21
    assert op.fields["Effect_1"] == 6
    assert op.fields["EffectAura_1"] == 207
    assert op.fields["EffectBasePoints_1"] == 140000
    assert op.fields["Name_Lang_zhCN"] == "测试符文牡鹿"


def test_build_dbc_plan_flying_mount() -> None:
    """验证飞行坐骑的 AttributesEx4。"""
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
        db={},
        mount_type="飞行坐骑",
    )
    plan = build_dbc_plan(mount)
    spell_plan = next(p for p in plan.plans if p.dbc_file == "Spell.dbc")
    assert spell_plan.operations[0].fields["AttributesExD"] == 67108864


def test_build_sql_plan_structure(sample_mount: Mount) -> None:
    """验证 sql-plan 结构。"""
    plan = build_sql_plan(sample_mount)

    assert plan.target_database == "acore_world"
    assert plan.output_sql_file == "output/db_patch.sql"

    table_names = {t.name for t in plan.tables}
    assert table_names == {"creature_model_info", "creature_template", "item_template"}


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
