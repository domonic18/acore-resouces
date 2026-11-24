"""坐骑补丁预览与流程状态推导单元测试。"""

from __future__ import annotations

from pathlib import Path

from app.preview.asset_resolver import _extract_texture_variations, _match_texture_files
from app.schemas.flow import FLOW_STEP_IDS
from app.schemas.resource import CreatureDisplayInfo, DbcInfo, Mount, OfficialDbInfo
from app.services.mount_preview import build_patch_preview


def _mount(**kwargs) -> Mount:
    """构造一个字段齐全的坐骑资源。"""
    defaults = {
        "id": 9001,
        "model_folder": "TestMount",
        "official_db": OfficialDbInfo(name="测试坐骑"),
        "mount_type": "陆地坐骑",
        "dbc": DbcInfo(
            creature_display_info=CreatureDisplayInfo(
                id=140999,
                model_id=4999,
                texture_variation_1="testmount_blue",
            )
        ),
    }
    defaults.update(kwargs)
    return Mount(**defaults)  # type: ignore[arg-type]


def test_flow_step_ids_are_unique_and_ordered() -> None:
    assert len(FLOW_STEP_IDS) == 9
    assert len(set(FLOW_STEP_IDS)) == 9
    assert FLOW_STEP_IDS[0] == "select-candidates"
    assert FLOW_STEP_IDS[-1] == "publish-deploy"


def test_extract_texture_variations_reads_pydantic_model() -> None:
    """贴图变体取自 Pydantic 模型而非 dict，早期实现按 dict 判断导致恒为空。"""
    variations = _extract_texture_variations(_mount())
    assert variations == ["testmount_blue"]


def test_match_texture_files_dedupes_repeated_variations() -> None:
    """三个变体槽位指向同一张贴图时只保留一条匹配。"""
    from app.preview.asset_resolver import AssetFile

    texture = AssetFile(
        name="TestMount_Blue.blp",
        relative_path="x/TestMount_Blue.blp",
        absolute_path=Path("/tmp/TestMount_Blue.blp"),
        file_type="blp",
    )
    matched = _match_texture_files([texture], ["testmount_blue"] * 3)
    assert len(matched) == 1


def test_preview_reports_missing_assets_as_error() -> None:
    preview = build_patch_preview(_mount(model_folder="__missing_for_test__"))
    assert preview.ready is False
    codes = {issue.code for issue in preview.issues}
    assert "assets_missing" in codes
    assert any(issue.severity == "error" for issue in preview.issues)


def test_preview_reports_missing_required_fields() -> None:
    """必填字段缺失时预检不通过，并逐个列出缺失字段。"""
    from app.schemas.dbc import Item, Spell

    resource = _mount(
        dbc=DbcInfo(
            creature_display_info=CreatureDisplayInfo(id=140999, model_id=4999),
            spell=Spell(),
            item=Item(),
        ),
    )
    assert resource.db.creature_template.entry in (None, 0)

    preview = build_patch_preview(resource)
    missing = {field.path for field in preview.required_fields.missing}
    assert "dbc.spell.id" in missing
    assert "db.creature_template.entry" in missing
    assert preview.ready is False
    assert "missing_required_field" in {issue.code for issue in preview.issues}


def test_preview_is_read_only() -> None:
    """预览不得创建补丁任务目录。"""
    from app.core.config import settings

    jobs_dir = settings.patch_jobs_dir
    before = set(jobs_dir.glob("mount_9*")) if jobs_dir.exists() else set()
    build_patch_preview(_mount())
    after = set(jobs_dir.glob("mount_9*")) if jobs_dir.exists() else set()
    assert before == after
