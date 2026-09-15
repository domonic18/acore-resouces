"""NPC 分类字段（npc_type/subtype）与 npc_wowhead_url 测试。"""

from __future__ import annotations

import pytest
import yaml

from app.schemas.resource import NPC_TYPES, Mount, Npc, Pet


def test_npc_type_and_subtype_default_none() -> None:
    npc = Npc(id=1, model_folder="folder")
    assert npc.npc_type is None
    assert npc.subtype is None
    assert npc.official_db.npc_wowhead_url is None


def test_valid_npc_type_preserved() -> None:
    npc = Npc(id=1, model_folder="folder", npc_type="人形生物", subtype="兽人")
    assert npc.npc_type == "人形生物"
    assert npc.subtype == "兽人"


def test_unknown_npc_type_rejected() -> None:
    with pytest.raises(ValueError, match="未知 npc_type"):
        Npc(id=1, model_folder="folder", npc_type="不存在的分类")


def test_npc_type_not_available_on_mount_and_pet() -> None:
    mount = Mount(id=2, model_folder="mfolder", npc_type="野兽")  # type: ignore[call-arg]
    pet = Pet(id=3, model_folder="pfolder", npc_type="龙类")  # type: ignore[call-arg]
    assert not hasattr(mount, "npc_type")
    assert not hasattr(pet, "npc_type")


def test_npc_types_vocabulary() -> None:
    assert len(NPC_TYPES) == 10
    assert "野兽" in NPC_TYPES
    assert "人形生物" in NPC_TYPES
    assert "未指定" in NPC_TYPES


def test_npc_type_yaml_round_trip_preserved() -> None:
    npc = Npc(id=1, model_folder="folder", npc_type="亡灵", subtype="骷髅")
    npc.official_db.npc_wowhead_url = "https://www.wowhead.com/cn/npc=15438"
    dumped = yaml.safe_load(yaml.safe_dump(npc.model_dump()))
    restored = Npc(**dumped)
    assert restored.npc_type == "亡灵"
    assert restored.subtype == "骷髅"
    assert restored.official_db.npc_wowhead_url == "https://www.wowhead.com/cn/npc=15438"
