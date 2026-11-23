"""M2 元数据读取服务单元测试。"""

from __future__ import annotations

import struct
from pathlib import Path

import pytest

from app.preview.m2_reader import (
    M2Metadata,
    read_m2_metadata,
    read_skin_texture_usage,
)

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures"
SAMPLE_M2 = FIXTURES_DIR / "sample.m2"


def _write_m2_v264(path: Path, textures: list[tuple[int, str]]) -> None:
    """写出一个最小可解析的 v264 M2 文件。

    Args:
        path: 目标路径。
        textures: [(贴图类型, 文件名)] 列表。
    """
    name = path.stem.encode("utf-8") + b"\x00"
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
    struct.pack_into("<II", data, 0x08, len(name), 0x100)
    struct.pack_into("<II", data, 0x50, len(textures), 0x200)
    struct.pack_into("<II", data, 0x80, len(textures), 0x300)
    struct.pack_into(f"<{len(textures)}h", data, 0x300, *range(len(textures)))
    data[0x100 : 0x100 + len(name)] = name
    data[0x200 : 0x200 + len(entries)] = entries
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


def test_read_m2_metadata() -> None:
    metadata = read_m2_metadata(SAMPLE_M2)
    assert isinstance(metadata, M2Metadata)
    assert metadata.name
    assert metadata.file_size > 0


def test_read_missing_file() -> None:
    with pytest.raises(FileNotFoundError):
        read_m2_metadata(Path("/nonexistent/model.m2"))


def test_read_invalid_file(tmp_path: Path) -> None:
    invalid = tmp_path / "invalid.m2"
    invalid.write_bytes(b"NOT_M2_DATA")
    with pytest.raises(ValueError):
        read_m2_metadata(invalid)


def test_read_v264_metadata(tmp_path: Path) -> None:
    model = tmp_path / "demo.m2"
    _write_m2_v264(model, [(0, "demo.blp"), (11, "")])

    metadata = read_m2_metadata(model)

    assert metadata.partial is False
    assert metadata.version == 264
    assert metadata.textures_count == 2
    assert [(t.texture_type, t.filename) for t in metadata.textures] == [
        (0, "demo.blp"),
        (11, ""),
    ]
    assert metadata.texture_lookups == [0, 1]


def test_read_skin_texture_usage(tmp_path: Path) -> None:
    model = tmp_path / "demo.m2"
    _write_m2_v264(model, [(0, "a.blp"), (0, "b.blp"), (0, "c.blp")])
    _write_skin(tmp_path / "demo.skin", [0, 2])

    metadata = read_m2_metadata(model)
    used = read_skin_texture_usage(model, metadata)

    assert used == {0, 2}


def test_read_skin_texture_usage_empty_without_lookups(tmp_path: Path) -> None:
    model = tmp_path / "demo.m2"
    _write_m2_v264(model, [(0, "a.blp")])
    metadata = read_m2_metadata(model)
    metadata.texture_lookups = []

    assert read_skin_texture_usage(model, metadata) == set()
