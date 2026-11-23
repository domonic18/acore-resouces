"""icon_infrastructure 单元测试（不依赖真实 DBC / 图标库，全部注入）。"""

from __future__ import annotations

from pathlib import Path

from app.schemas.resource import Mount
from app.services.icon_infrastructure import (
    ICON_INFRA_DBC_FILES,
    MPQ_DBC_DIR,
    MPQ_ICON_DIR,
    collect_referenced_icon_names,
    stage_icon_infrastructure,
)


def _make_mount(
    mount_id: int, icon_id: int, display_id: int, template_displayid: int | None = None
) -> Mount:
    """构造仅含图标引用字段的样本坐骑。"""
    dbc_dict: dict = {
        "creature_model_data": {"id": 4000, "flags": 2, "model_name": "creature\\x\\x.m2"},
        "creature_display_info": {"id": 140000, "model_id": 4000},
        "spell": {"id": 80000, "visual_id": 9140000},
        "item": {"id": 91000, "class": 15, "subclass": 5},
    }
    if icon_id:
        dbc_dict["spell"]["icon_id"] = icon_id
    if display_id:
        dbc_dict["item"]["display_id"] = display_id
    db_dict: dict = {
        "creature_template": {"entry": 9140000, "name": "测试"},
        "creature_model_info": {"display_id": 140000},
        "item_template": {"entry": 91000, "name": "测试"},
    }
    if template_displayid is not None:
        db_dict["item_template"]["displayid"] = template_displayid
    return Mount(
        id=mount_id,
        model_folder="x_test",
        dbc=dbc_dict,  # type: ignore[arg-type]
        db=db_dict,  # type: ignore[arg-type]
        mount_type="陆地坐骑",
        star_rating="三星",
        subtype="测试",
    )


SPELL_ICONS = {17130: "inv_brontosaurusmount", 10084: "ability_mount_pandarenkite"}
ITEM_ICONS = {98130: "Interface\\Icons\\INV_BrontosaurusMount", 91084: "inv_pandarenkite"}


class TestCollectReferencedIconNames:
    def test_collects_spell_and_item_icons(self) -> None:
        mounts = [_make_mount(24, icon_id=17130, display_id=98130)]
        result = collect_referenced_icon_names(
            mounts, spell_icon_names=SPELL_ICONS, item_display_icons=ITEM_ICONS
        )
        assert result.icon_names == {"inv_brontosaurusmount"}
        assert result.missing == []

    def test_item_display_id_fallback_to_template(self) -> None:
        # dbc.item.display_id=0，回退 db.item_template.displayid
        mounts = [_make_mount(1, icon_id=0, display_id=0, template_displayid=91084)]
        result = collect_referenced_icon_names(
            mounts, spell_icon_names=SPELL_ICONS, item_display_icons=ITEM_ICONS
        )
        assert result.icon_names == {"inv_pandarenkite"}
        assert result.missing == []

    def test_normalizes_path_and_case(self) -> None:
        # ItemDisplayInfo 里的图标名带路径前缀、大小写混合
        mounts = [_make_mount(1, icon_id=0, display_id=98130)]
        result = collect_referenced_icon_names(
            mounts,
            spell_icon_names={},
            item_display_icons={98130: "Interface\\Icons\\INV_BrontosaurusMount"},
        )
        assert result.icon_names == {"inv_brontosaurusmount"}

    def test_missing_spell_icon_recorded(self) -> None:
        mounts = [_make_mount(24, icon_id=99999, display_id=0)]
        result = collect_referenced_icon_names(
            mounts, spell_icon_names=SPELL_ICONS, item_display_icons=ITEM_ICONS
        )
        assert result.icon_names == set()
        assert len(result.missing) == 1
        entry = result.missing[0]
        assert entry["source"] == "mount_0024 spell.icon_id"
        assert entry["ref_id"] == 99999
        assert "SpellIcon" in entry["reason"]

    def test_missing_item_display_recorded(self) -> None:
        mounts = [_make_mount(5, icon_id=0, display_id=88888)]
        result = collect_referenced_icon_names(
            mounts, spell_icon_names=SPELL_ICONS, item_display_icons=ITEM_ICONS
        )
        assert result.icon_names == set()
        assert result.missing[0]["source"] == "mount_0005 display_id"
        assert "ItemDisplayInfo" in result.missing[0]["reason"]

    def test_zero_refs_skipped(self) -> None:
        mounts = [_make_mount(1, icon_id=0, display_id=0)]
        result = collect_referenced_icon_names(mounts, spell_icon_names={}, item_display_icons={})
        assert result.icon_names == set()
        assert result.missing == []


class TestStageIconInfrastructure:
    def test_stages_dbc_and_icons(self, tmp_path: Path) -> None:
        # 准备源 DBC 目录
        dbc_dir = tmp_path / "dbc-src"
        dbc_dir.mkdir()
        for name in ICON_INFRA_DBC_FILES:
            (dbc_dir / name).write_bytes(b"DBC")

        # 准备图标库
        lib_icon = tmp_path / "icons" / "inv_brontosaurusmount.blp"
        lib_icon.parent.mkdir()
        lib_icon.write_bytes(b"BLP")

        staging = tmp_path / "staging"
        staging.mkdir()
        mounts = [_make_mount(24, icon_id=17130, display_id=0)]

        result = stage_icon_infrastructure(
            staging,
            mounts,
            dbc_dir=dbc_dir,
            icon_lookup=lambda name: lib_icon if name == "inv_brontosaurusmount" else None,
            spell_icon_names=SPELL_ICONS,
            item_display_icons=ITEM_ICONS,
        )

        assert (staging / MPQ_DBC_DIR / "SpellIcon.dbc").read_bytes() == b"DBC"
        assert (staging / MPQ_DBC_DIR / "ItemDisplayInfo.dbc").read_bytes() == b"DBC"
        assert MPQ_DBC_DIR / "SpellIcon.dbc" in result["dbc"]
        assert MPQ_ICON_DIR / "inv_brontosaurusmount.blp" in result["icons"]
        assert (staging / MPQ_ICON_DIR / "inv_brontosaurusmount.blp").read_bytes() == b"BLP"
        assert result["missing"] == []

    def test_missing_icon_texture_recorded(self, tmp_path: Path) -> None:
        dbc_dir = tmp_path / "dbc-src"
        dbc_dir.mkdir()
        for name in ICON_INFRA_DBC_FILES:
            (dbc_dir / name).write_bytes(b"DBC")

        staging = tmp_path / "staging"
        staging.mkdir()
        mounts = [_make_mount(24, icon_id=17130, display_id=0)]

        result = stage_icon_infrastructure(
            staging,
            mounts,
            dbc_dir=dbc_dir,
            icon_lookup=lambda _name: None,
            spell_icon_names=SPELL_ICONS,
            item_display_icons=ITEM_ICONS,
        )
        assert result["icons"] == []
        assert result["missing"][0]["source"] == "Interface/icons/inv_brontosaurusmount.blp"

    def test_missing_dbc_source_recorded(self, tmp_path: Path) -> None:
        # 源目录里只放了 SpellIcon，ItemDisplayInfo 缺失
        dbc_dir = tmp_path / "dbc-src"
        dbc_dir.mkdir()
        (dbc_dir / "SpellIcon.dbc").write_bytes(b"DBC")

        staging = tmp_path / "staging"
        staging.mkdir()
        mounts = [_make_mount(1, icon_id=0, display_id=0)]

        result = stage_icon_infrastructure(
            staging,
            mounts,
            dbc_dir=dbc_dir,
            icon_lookup=lambda _name: None,
            spell_icon_names={},
            item_display_icons={},
        )
        assert MPQ_DBC_DIR / "SpellIcon.dbc" in result["dbc"]
        missing_sources = {entry["source"] for entry in result["missing"]}
        assert "DBFilesClient/ItemDisplayInfo.dbc" in missing_sources
