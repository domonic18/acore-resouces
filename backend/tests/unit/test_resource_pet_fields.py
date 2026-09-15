"""宠物分类字段（pet_type/subtype）与资源标签（tags）测试。"""

from __future__ import annotations

import pytest
import yaml
from typer.testing import CliRunner

from app.cli.resource import app as resource_cli
from app.schemas.resource import PET_TYPES, Mount, Npc, Pet


def test_pet_type_and_subtype_default_none() -> None:
    pet = Pet(id=1, model_folder="folder")
    assert pet.pet_type is None
    assert pet.subtype is None


def test_valid_pet_type_preserved() -> None:
    pet = Pet(id=1, model_folder="folder", pet_type="龙类", subtype="幼龙")
    assert pet.pet_type == "龙类"
    assert pet.subtype == "幼龙"


def test_unknown_pet_type_rejected() -> None:
    with pytest.raises(ValueError, match="未知 pet_type"):
        Pet(id=1, model_folder="folder", pet_type="不存在的分类")


def test_pet_type_not_available_on_mount_and_npc() -> None:
    mount = Mount(id=2, model_folder="mfolder", pet_type="龙类")  # type: ignore[call-arg]
    npc = Npc(id=3, model_folder="nfolder", pet_type="走兽")  # type: ignore[call-arg]
    assert not hasattr(mount, "pet_type")
    assert not hasattr(npc, "pet_type")


def test_tags_default_empty_list() -> None:
    for resource in (Mount(id=1, model_folder="a"), Pet(id=2, model_folder="b"), Npc(id=3, model_folder="c")):
        assert resource.tags == []


def test_tags_yaml_round_trip_preserved() -> None:
    pet = Pet(id=1, model_folder="folder", tags=["no_official_data", "retail_only"])
    dumped = yaml.safe_load(yaml.safe_dump(pet.model_dump()))
    restored = Pet(**dumped)
    assert restored.tags == ["no_official_data", "retail_only"]


def test_pet_type_yaml_round_trip_preserved() -> None:
    pet = Pet(id=1, model_folder="folder", pet_type="机械", subtype="机械鸟")
    dumped = yaml.safe_load(yaml.safe_dump(pet.model_dump()))
    restored = Pet(**dumped)
    assert restored.pet_type == "机械"
    assert restored.subtype == "机械鸟"


def test_pet_types_vocabulary() -> None:
    assert len(PET_TYPES) == 11
    assert "异怪" in PET_TYPES
    assert "恶魔" in PET_TYPES


def test_validate_exempts_no_official_data_pet() -> None:
    """0001 号宠物 name 为空但带 no_official_data 标签，校验不应报缺名错误。"""
    result = CliRunner().invoke(resource_cli, ["validate", "--type", "pet", "--id", "1"])
    assert result.exit_code == 0
    assert "缺少 official_db.name" not in result.output
