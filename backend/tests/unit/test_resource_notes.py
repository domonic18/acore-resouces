"""资源备注字段（notes）解析与归一化测试。"""

from __future__ import annotations

from app.schemas.resource import Mount, Npc, Pet

NOTES_CONTENT = (
    "官方出处：军团再临 7.2 换色版\n"
    "获取：英雄地下城 加固的邪铁宝箱掉落（2%）\n"
    "参考：[Wowhead](https://www.wowhead.com/cn/item=143637)"
)


def test_notes_preserved_through_model_round_trip() -> None:
    data = {
        "id": 1,
        "model_folder": "folder",
        "resource_type": "mount",
        "notes": NOTES_CONTENT,
    }
    resource = Mount(**data)
    assert resource.notes == NOTES_CONTENT
    restored = Mount(**resource.model_dump())
    assert restored.notes == NOTES_CONTENT


def test_notes_default_none_for_legacy_yaml() -> None:
    resource = Mount(id=1, model_folder="folder")
    assert resource.notes is None


def test_notes_empty_string_normalized_to_none() -> None:
    assert Mount(id=1, model_folder="folder", notes="").notes is None


def test_notes_available_on_pet_and_npc() -> None:
    pet = Pet(id=2, model_folder="petfolder", notes="宠物备注")
    npc = Npc(id=3, model_folder="npcfolder", notes="")
    assert pet.notes == "宠物备注"
    assert npc.notes is None
