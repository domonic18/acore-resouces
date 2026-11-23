"""坐骑资源闭包审计单元测试。"""

from __future__ import annotations

import struct
from pathlib import Path

import pytest

from app.schemas.resource import Mount
from app.services import mount_audit


def _write_m2(path: Path, textures: list[tuple[int, str]]) -> None:
    """写出一个最小可解析的 v264 M2 文件。

    Args:
        path: 目标路径。
        textures: [(贴图类型, 文件名)] 列表。
    """
    name = path.stem.encode("utf-8") + b"\x00"
    name_offset = 0x100
    table_offset = 0x200
    strings_offset = 0x400

    filename_offsets: list[int] = []
    filenames = b""
    for _, filename in textures:
        filename_offsets.append(strings_offset + len(filenames))
        filenames += filename.encode("utf-8") + b"\x00"

    entries = b"".join(
        struct.pack(
            "<IIII",
            tex_type,
            0,
            len(filename.encode("utf-8")) + 1,
            filename_offsets[index],
        )
        for index, (tex_type, filename) in enumerate(textures)
    )

    data = bytearray(strings_offset + len(filenames))
    data[0:4] = b"MD20"
    struct.pack_into("<I", data, 0x04, 264)
    struct.pack_into("<II", data, 0x08, len(name), name_offset)
    struct.pack_into("<II", data, 0x50, len(textures), table_offset)
    struct.pack_into("<II", data, 0x80, len(textures), 0x300)
    struct.pack_into(f"<{len(textures)}h", data, 0x300, *range(len(textures)))
    data[name_offset : name_offset + len(name)] = name
    data[table_offset : table_offset + len(entries)] = entries
    data[strings_offset : strings_offset + len(filenames)] = filenames
    path.write_bytes(bytes(data))


def _write_skin(path: Path, texture_lookups: list[int]) -> None:
    """写出一个最小可解析的 SKIN 文件。

    Args:
        path: 目标路径。
        texture_lookups: 每个 batch 的 textureLookup 值。
    """
    batches_offset = 0x100
    data = bytearray(batches_offset + len(texture_lookups) * 26)
    data[0:4] = b"SKIN"
    struct.pack_into("<II", data, 0x24, len(texture_lookups), batches_offset)
    for index, lookup in enumerate(texture_lookups):
        struct.pack_into("<H", data, batches_offset + index * 26 + 16, lookup)
    path.write_bytes(bytes(data))


def _make_mount(
    model_folder: str,
    model_name: str,
    texture_variation_1: str | None = None,
    resource_id: int = 1,
) -> Mount:
    """构造一个用于测试的坐骑资源。"""
    return Mount(
        id=resource_id,
        model_folder=model_folder,
        dbc={
            "creature_model_data": {"id": 104000 + resource_id, "model_name": model_name},
            "creature_display_info": {
                "id": 140000 + resource_id,
                "model_id": 104000 + resource_id,
                "texture_variation_1": texture_variation_1,
            },
        },
    )


@pytest.fixture()
def model_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """准备一个假的坐骑资源目录，并把 resolve_resource_dir 指向它。"""
    sources = tmp_path / "sources" / "mounts"
    sources.mkdir(parents=True)
    monkeypatch.setattr(
        mount_audit, "resolve_resource_dir", lambda resource_type, folder: sources / folder
    )
    return sources


class _EmptyLookup:
    """始终返回「查不到记录」的 DBC 查询桩，避免单元测试依赖真实 DBC 文件。"""

    def get(self, dbc_file: str, record_id: int | None) -> dict[str, object] | None:
        return None


def _audit(mount: Mount) -> mount_audit.MountAuditResult:
    """审计单个坐骑（DBC 查询始终返回空）。"""
    return mount_audit.audit_mount(mount, _EmptyLookup())


def test_missing_source_dir_is_error(model_dir: Path) -> None:
    result = _audit(_make_mount("nope", "creature\\nope\\nope.m2"))
    assert [issue.code for issue in result.errors] == ["source_dir_missing"]


def test_missing_model_file_is_error(model_dir: Path) -> None:
    folder = model_dir / "demo"
    folder.mkdir()
    result = _audit(_make_mount("demo", "creature\\demo\\demo.m2"))
    assert [issue.code for issue in result.errors] == ["model_file_missing"]


def test_empty_type0_texture_used_by_geometry_is_error(model_dir: Path) -> None:
    folder = model_dir / "demo"
    folder.mkdir()
    _write_m2(folder / "demo.m2", [(0, "")])
    _write_skin(folder / "demo.skin", [0])

    result = _audit(_make_mount("demo", "creature\\demo\\demo.m2"))
    assert "texture_name_empty" in {issue.code for issue in result.errors}


def test_unused_empty_type0_texture_is_warning(model_dir: Path) -> None:
    folder = model_dir / "demo"
    folder.mkdir()
    _write_m2(folder / "demo.m2", [(0, ""), (0, "demo.blp")])
    _write_skin(folder / "demo.skin", [1])

    result = _audit(_make_mount("demo", "creature\\demo\\demo.m2"))
    empty = [issue for issue in result.issues if issue.code == "texture_name_empty"]
    assert len(empty) == 1
    assert empty[0].severity == mount_audit.SEVERITY_WARNING


def test_missing_texture_file_is_error(model_dir: Path) -> None:
    folder = model_dir / "demo"
    folder.mkdir()
    _write_m2(folder / "demo.m2", [(0, "missing.blp")])
    _write_skin(folder / "demo.skin", [0])

    result = _audit(_make_mount("demo", "creature\\demo\\demo.m2"))
    assert "texture_file_missing" in {issue.code for issue in result.errors}


def test_texture_lookup_is_case_insensitive(model_dir: Path) -> None:
    folder = model_dir / "demo"
    folder.mkdir()
    (folder / "camelmount_white.blp").write_bytes(b"BLP2")
    _write_m2(folder / "demo.m2", [(0, "CAMELMOUNT_WHITE.blp")])
    _write_skin(folder / "demo.skin", [0])

    result = _audit(_make_mount("demo", "creature\\demo\\demo.m2"))
    assert not [issue for issue in result.issues if issue.code == "texture_file_missing"]


def test_texture_variation_missing_blp_is_error(model_dir: Path) -> None:
    folder = model_dir / "demo"
    folder.mkdir()
    _write_m2(folder / "demo.m2", [(11, "")])
    _write_skin(folder / "demo.skin", [0])

    result = _audit(_make_mount("demo", "creature\\demo\\demo.m2", texture_variation_1="NOT_THERE"))
    assert "texture_variation_missing" in {issue.code for issue in result.errors}


def test_texture_variation_present_blp_passes(model_dir: Path) -> None:
    folder = model_dir / "demo"
    folder.mkdir()
    (folder / "camelmount_white.blp").write_bytes(b"BLP2")
    _write_m2(folder / "demo.m2", [(11, "")])
    _write_skin(folder / "demo.skin", [0])

    result = _audit(
        _make_mount("demo", "creature\\demo\\demo.m2", texture_variation_1="CAMELMOUNT_WHITE")
    )
    assert not [issue for issue in result.issues if issue.code.startswith("texture_variation")]


def test_same_model_with_different_variations_is_not_conflict(model_dir: Path) -> None:
    folder = model_dir / "demo"
    folder.mkdir()
    _write_m2(folder / "demo.m2", [(11, "")])
    _write_skin(folder / "demo.skin", [0])

    mounts = [
        _make_mount("demo", "creature\\demo\\demo.m2", "CAMELMOUNT_WHITE", resource_id=1),
        _make_mount("demo2", "creature\\demo\\demo.m2", "CAMELMOUNT_BROWN", resource_id=2),
    ]
    report = mount_audit.audit_mounts(mounts)
    assert not [issue for issue in report.results[0].issues if issue.code == "model_name_duplicate"]


def test_same_model_with_same_variations_is_conflict(model_dir: Path) -> None:
    folder = model_dir / "demo"
    folder.mkdir()
    _write_m2(folder / "demo.m2", [(11, "")])
    _write_skin(folder / "demo.skin", [0])

    mounts = [
        _make_mount("demo", "creature\\demo\\demo.m2", "CAMELMOUNT_WHITE", resource_id=1),
        _make_mount("demo2", "creature\\demo\\demo.m2", "CAMELMOUNT_WHITE", resource_id=2),
    ]
    report = mount_audit.audit_mounts(mounts)
    assert all(
        any(issue.code == "model_name_duplicate" for issue in result.issues)
        for result in report.results
    )


def test_report_to_dict_shape(model_dir: Path) -> None:
    result = _audit(_make_mount("nope", "creature\\nope\\nope.m2"))
    report = mount_audit.MountAuditReport(results=[result])
    payload = mount_audit.audit_report_to_dict(report)
    assert payload["summary"]["mounts"] == 1
    assert payload["summary"]["errors"] == 1
    codes = {issue["code"] for issue in payload["results"][0]["issues"]}
    assert "source_dir_missing" in codes
