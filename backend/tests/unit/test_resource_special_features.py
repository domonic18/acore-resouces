"""坐骑特殊功能字段（special_features）测试。"""

from __future__ import annotations

import yaml

from app.schemas.resource import SPECIAL_FEATURES, Mount, Npc, Pet


def test_default_empty_for_legacy_yaml() -> None:
    resource = Mount(id=1, model_folder="folder")
    assert resource.special_features == []


def test_known_features_preserved() -> None:
    resource = Mount(
        id=1,
        model_folder="folder",
        special_features=["三人骑乘", "自带拍卖行"],
    )
    assert resource.special_features == ["三人骑乘", "自带拍卖行"]


def test_unknown_features_dropped() -> None:
    resource = Mount(
        id=1,
        model_folder="folder",
        special_features=["水面行走", "不存在功能"],
    )
    assert resource.special_features == ["水面行走"]


def test_yaml_round_trip_preserves_features() -> None:
    resource = Mount(
        id=1,
        model_folder="folder",
        special_features=["双人骑乘", "修理"],
    )
    dumped = yaml.safe_load(yaml.safe_dump(resource.model_dump()))
    restored = Mount(**dumped)
    assert restored.special_features == ["双人骑乘", "修理"]


def test_not_available_on_pet_and_npc() -> None:
    pet = Pet(id=2, model_folder="petfolder", special_features=["水面行走"])  # type: ignore[call-arg]
    npc = Npc(id=3, model_folder="npcfolder", special_features=["修理"])  # type: ignore[call-arg]
    assert not hasattr(pet, "special_features")
    assert not hasattr(npc, "special_features")


def test_vocabulary_complete() -> None:
    assert len(SPECIAL_FEATURES) == 9
    assert "骑乘采集" in SPECIAL_FEATURES
