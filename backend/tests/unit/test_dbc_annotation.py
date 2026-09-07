"""dbc_annotation 来源资源标注服务单元测试。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.config import Settings
from app.services import dbc_annotation


@pytest.fixture
def annotation_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """临时资源目录 + registry.json，并隔离缓存与 settings。"""
    resources_dir = tmp_path / "resources"
    mounts_dir = resources_dir / "mounts"
    mounts_dir.mkdir(parents=True)
    registry_file = tmp_path / "registry.json"
    registry_file.write_text("{}", encoding="utf-8")

    patched = Settings()
    patched.resources_dir = resources_dir
    patched.registry_file = registry_file
    monkeypatch.setattr(dbc_annotation, "settings", patched)
    monkeypatch.setattr(dbc_annotation, "_cache_key", None)
    monkeypatch.setattr(dbc_annotation, "_annotation_map", {})
    return resources_dir


def _write_mount(
    mounts_dir: Path, resource_id: int, model_folder: str, name: str, dbc: dict
) -> None:
    (mounts_dir / f"{resource_id:04d}-{model_folder}.yaml").write_text(
        json.dumps(
            {
                "id": resource_id,
                "model_folder": model_folder,
                "official_db": {"name": name},
                "dbc": dbc,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def test_annotation_map_covers_all_mappings(annotation_env: Path) -> None:
    """补丁写入口径与官方引用口径均进入映射。"""
    _write_mount(
        annotation_env / "mounts",
        7,
        "foxmount",
        "洛希恩徘徊者",
        {
            "creature_model_data": {"id": 4004},
            "creature_display_info": {"id": 140004},
            "spell": {"id": 80004, "icon_id": 12357, "visual_id": 777},
            "item": {"id": 91004, "display_id": 31511},
        },
    )

    annotation_map = dbc_annotation.get_annotation_map()

    assert annotation_map[("CreatureModelData.dbc", 4004)][0]["name"] == "洛希恩徘徊者"
    assert annotation_map[("CreatureDisplayInfo.dbc", 140004)][0]["type"] == "mount"
    assert annotation_map[("Spell.dbc", 80004)][0]["id"] == 7
    assert annotation_map[("Item.dbc", 91004)][0]["model_folder"] == "foxmount"
    assert annotation_map[("ItemDisplayInfo.dbc", 31511)]
    assert annotation_map[("SpellIcon.dbc", 12357)]
    assert annotation_map[("SpellVisual.dbc", 777)]


def test_multiple_resources_same_record(annotation_env: Path) -> None:
    """多条资源引用同一记录时聚合为列表。"""
    _write_mount(annotation_env / "mounts", 1, "mount_a", "甲", {"spell": {"id": 80001}})
    _write_mount(annotation_env / "mounts", 2, "mount_b", "乙", {"spell": {"id": 80001}})

    resources = dbc_annotation.get_annotation_map()[("Spell.dbc", 80001)]
    assert [r["id"] for r in resources] == [1, 2]


def test_resource_without_dbc_tree_skipped(annotation_env: Path) -> None:
    """无 dbc 子树或值非整数的资源不进入映射。"""
    _write_mount(annotation_env / "mounts", 3, "no_dbc", "无DBC", {})
    _write_mount(annotation_env / "mounts", 4, "str_id", "字符串ID", {"spell": {"id": "80004"}})

    annotation_map = dbc_annotation.get_annotation_map()
    assert ("Spell.dbc", 80004) not in annotation_map


def test_cache_invalidated_by_registry_change(annotation_env: Path) -> None:
    """registry.json 变化（mtime/size）后映射重建。"""
    registry_file = annotation_env.parent / "registry.json"
    _write_mount(annotation_env / "mounts", 5, "first", "首个", {"spell": {"id": 80005}})
    assert ("Spell.dbc", 80005) in dbc_annotation.get_annotation_map()

    _write_mount(annotation_env / "mounts", 6, "second", "第二个", {"spell": {"id": 80006}})
    # 模拟资源 CRUD 后 registry.json 重新生成（内容/大小变化）
    registry_file.write_text(json.dumps({"counts": {"mounts": 2}}), encoding="utf-8")
    annotation_map = dbc_annotation.get_annotation_map()
    assert ("Spell.dbc", 80006) in annotation_map


def test_get_annotations_filters_requested_ids(annotation_env: Path) -> None:
    """批量标注只返回命中记录。"""
    _write_mount(annotation_env / "mounts", 8, "annotated", "有标注", {"spell": {"id": 80008}})

    result = dbc_annotation.get_annotations("Spell.dbc", [80008, 99999])
    assert result == [
        {
            "record_id": 80008,
            "resources": [
                {
                    "id": 8,
                    "type": "mount",
                    "name": "有标注",
                    "model_folder": "annotated",
                }
            ],
        }
    ]
    assert dbc_annotation.get_record_annotation("Spell.dbc", 99999) == []
