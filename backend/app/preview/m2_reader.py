"""M2 模型文件级元数据读取。

pywowlib 未发布到 PyPI，因此本模块使用 Python 标准库 struct 直接解析 M2 文件头。
为兼顾不同资料片版本的 M2 文件，当遇到未经验证的版本时，仅返回基础信息（版本、
名称、文件大小）与 .skin 文件解析结果，避免输出错误元数据。
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

M2_MAGIC = b"MD20"
SKIN_MAGIC = b"SKIN"

# 已验证可完整解析的 M2 版本号（263=WotLK 3.3.5a，264=Cataclysm 4.x）
SUPPORTED_FULL_VERSIONS = {263, 264}

# 各版本贴图表在文件头中的字节位置（count, offset）。
# 263（WotLK）在 vertices 之后是 numViews + numSkinProfiles 两个 uint32；
# 264 起两者合并为一个 uint32，其后的数组整体前移 4 字节。
TEXTURE_TABLE_OFFSETS: dict[int, tuple[int, int]] = {
    263: (0x54, 0x58),
    264: (0x50, 0x54),
}

# 各版本共有且位置固定的表头字段。
ANIMATIONS_COUNT_OFFSET = 0x1C
VERTICES_COUNT_OFFSET = 0x3C

# 各版本 textureLookups 表在文件头中的字节位置（count, offset）。
# 该表把 skin 的 batch 编号映射到 M2 贴图表下标。
TEXTURE_LOOKUP_OFFSETS: dict[int, tuple[int, int]] = {
    263: (0x84, 0x88),
    264: (0x80, 0x84),
}

# SKIN 文件头：magic 之后依次是 indices / triangles / boneIndices /
# submeshes / batches 五组 (count, offset)。
SKIN_BATCHES_COUNT_OFFSET = 0x24
SKIN_BATCHES_OFFSET = 0x28

# SKIN batch 记录长度（13 个 uint16），其中 textureLookup 位于第 9 个 uint16。
SKIN_BATCH_SIZE = 26
SKIN_BATCH_TEXTURE_LOOKUP_OFFSET = 16


@dataclass
class M2TextureInfo:
    """M2 贴图信息。"""

    texture_type: int
    flags: int
    filename: str


@dataclass
class M2Metadata:
    """M2 文件元数据。"""

    version: int
    name: str
    file_size: int
    vertices_count: int | None = None
    animations_count: int | None = None
    textures_count: int | None = None
    textures: list[M2TextureInfo] = field(default_factory=list)
    texture_lookups: list[int] = field(default_factory=list)
    skin_files: list[dict[str, Any]] = field(default_factory=list)
    partial: bool = False
    partial_reason: str | None = None

    @property
    def geosets_count(self) -> int:
        """从 skin 文件汇总的 geoset 数量。"""
        return sum(s.get("submeshes_count", 0) for s in self.skin_files)


def _read_c_string(data: bytes, offset: int, length: int) -> str:
    """读取以 NUL 结尾的字符串。"""
    if offset >= len(data):
        return ""
    end = data.find(b"\x00", offset)
    if end == -1 or end > offset + length:
        end = offset + length
    return data[offset:end].decode("utf-8", errors="ignore")


def _parse_header_name(data: bytes) -> tuple[int, int, str]:
    """解析 M2 文件头中的版本与名称。"""
    version = struct.unpack_from("<I", data, 4)[0]
    name_length, name_offset = struct.unpack_from("<II", data, 8)
    name = _read_c_string(data, name_offset, name_length)
    return version, name_length, name


def _parse_full_metadata(m2_path: Path, data: bytes, version: int) -> M2Metadata:
    """解析已知版本 M2 的完整元数据。

    标准头布局（起始偏移 0x14 = 20）：
    0: nGlobalSequences, 1: ofsGlobalSequences
    2: nAnimations,      3: ofsAnimations
    4: nAnimationLookup, 5: ofsAnimationLookup
    6: nBones,           7: ofsBones
    8: nKeyBoneLookup,   9: ofsKeyBoneLookup
    10: nVertices,       11: ofsVertices
    12: nColors,         13: ofsColors
    14: nTextures,       15: ofsTextures

    264 起 numViews/numSkinProfiles 合并为一个 uint32，贴图表位置见
    TEXTURE_TABLE_OFFSETS。
    """
    count_offset, table_offset = TEXTURE_TABLE_OFFSETS[version]
    n_animations = struct.unpack_from("<I", data, ANIMATIONS_COUNT_OFFSET)[0]
    n_vertices = struct.unpack_from("<I", data, VERTICES_COUNT_OFFSET)[0]
    n_textures = struct.unpack_from("<I", data, count_offset)[0]
    ofs_textures = struct.unpack_from("<I", data, table_offset)[0]

    textures: list[M2TextureInfo] = []
    for i in range(n_textures):
        entry_offset = ofs_textures + i * 16
        if entry_offset + 16 > len(data):
            break
        tex_type, tex_flags, filename_length, filename_offset = struct.unpack_from(
            "<IIII", data, entry_offset
        )
        filename = _read_c_string(data, filename_offset, filename_length)
        textures.append(M2TextureInfo(texture_type=tex_type, flags=tex_flags, filename=filename))

    version, _, name = _parse_header_name(data)
    return M2Metadata(
        version=version,
        name=name,
        file_size=len(data),
        vertices_count=n_vertices,
        animations_count=n_animations,
        textures_count=n_textures,
        textures=textures,
        texture_lookups=_read_texture_lookups(data, version),
        skin_files=_read_skin_files(m2_path),
    )


def _read_texture_lookups(data: bytes, version: int) -> list[int]:
    """读取 textureLookups 表：batch 编号 → M2 贴图表下标。"""
    offsets = TEXTURE_LOOKUP_OFFSETS.get(version)
    if offsets is None:
        return []
    count_offset, table_offset = offsets
    count = struct.unpack_from("<I", data, count_offset)[0]
    offset = struct.unpack_from("<I", data, table_offset)[0]
    if count == 0 or offset == 0 or offset + count * 2 > len(data):
        return []
    return list(struct.unpack_from(f"<{count}h", data, offset))


def _read_skin_batch_lookups(skin_path: Path) -> list[int]:
    """读取单个 SKIN 文件中各 batch 的 textureLookup 值。"""
    try:
        data = skin_path.read_bytes()
    except OSError:
        return []
    if len(data) < 0x2C or data[:4] != SKIN_MAGIC:
        return []

    count = struct.unpack_from("<I", data, SKIN_BATCHES_COUNT_OFFSET)[0]
    offset = struct.unpack_from("<I", data, SKIN_BATCHES_OFFSET)[0]
    lookups: list[int] = []
    for index in range(count):
        entry = offset + index * SKIN_BATCH_SIZE
        if entry + SKIN_BATCH_SIZE > len(data):
            break
        lookups.append(struct.unpack_from("<H", data, entry + SKIN_BATCH_TEXTURE_LOOKUP_OFFSET)[0])
    return lookups


def read_skin_texture_usage(m2_path: Path, metadata: M2Metadata) -> set[int]:
    """统计模型实际用到的 M2 贴图表下标。

    链路：SKIN 的 batch → batch.textureLookup → M2.textureLookups → 贴图下标。
    只被未使用的贴图槽位（例如历史遗留的空文件名）引用不到的批次不会计入，
    因此不会把「存在但没人用」的坏贴图当成白模根因。

    Args:
        m2_path: M2 文件路径。
        metadata: 已解析的 M2 元数据。

    Returns:
        被实际使用的贴图下标集合；无法判定时返回空集合。
    """
    if not metadata.texture_lookups:
        return set()

    used: set[int] = set()
    for skin_path in sorted(m2_path.parent.glob(f"{m2_path.stem}*.skin")):
        for lookup in _read_skin_batch_lookups(skin_path):
            if lookup < len(metadata.texture_lookups):
                used.add(metadata.texture_lookups[lookup])
    return used


def _read_skin_file(skin_path: Path) -> dict[str, Any] | None:
    """读取单个 .skin 文件的元数据。"""
    if not skin_path.exists():
        return None

    data = skin_path.read_bytes()
    if len(data) < 28:
        return None
    if data[:4] != SKIN_MAGIC:
        return None

    try:
        submeshes_count = struct.unpack_from("<I", data, 28)[0]
    except struct.error:
        return None

    return {
        "file": str(skin_path),
        "submeshes_count": submeshes_count,
    }


def _read_skin_files(m2_path: Path) -> list[dict[str, Any]]:
    """读取 M2 文件所在目录下的所有相关 .skin 文件。"""
    directory = m2_path.parent
    base_name = m2_path.stem
    skin_files: list[dict[str, Any]] = []

    for skin_path in sorted(directory.glob(f"{base_name}*.skin")):
        info = _read_skin_file(skin_path)
        if info:
            skin_files.append(info)

    return skin_files


def read_m2_metadata(m2_path: Path) -> M2Metadata:
    """读取 M2 文件基础元数据。

    Args:
        m2_path: M2 文件路径。

    Returns:
        M2Metadata 对象。若版本未经验证，则返回 partial=True 并附带原因。

    Raises:
        FileNotFoundError: 文件不存在。
        ValueError: 文件格式不支持或解析失败。
    """
    if not m2_path.exists():
        raise FileNotFoundError(f"M2 文件不存在：{m2_path}")

    data = m2_path.read_bytes()
    if len(data) < 16:
        raise ValueError(f"M2 文件过短：{m2_path}")

    if data[:4] != M2_MAGIC:
        raise ValueError(f"不是有效的 M2 文件：{m2_path} (magic={data[:4]!r})")

    version, _, name = _parse_header_name(data)

    if version in SUPPORTED_FULL_VERSIONS:
        return _parse_full_metadata(m2_path, data, version)

    return M2Metadata(
        version=version,
        name=name,
        file_size=len(data),
        skin_files=_read_skin_files(m2_path),
        partial=True,
        partial_reason=f"M2 版本 {version} 未经验证，仅返回基础信息",
    )


def m2_metadata_to_dict(metadata: M2Metadata) -> dict[str, Any]:
    """将 M2Metadata 转为可序列化的字典。"""
    return {
        "version": metadata.version,
        "name": metadata.name,
        "file_size": metadata.file_size,
        "vertices_count": metadata.vertices_count,
        "animations_count": metadata.animations_count,
        "textures_count": metadata.textures_count,
        "geosets_count": metadata.geosets_count,
        "partial": metadata.partial,
        "partial_reason": metadata.partial_reason,
        "textures": [
            {
                "type": t.texture_type,
                "flags": t.flags,
                "filename": t.filename,
            }
            for t in metadata.textures
        ],
        "texture_lookups": metadata.texture_lookups,
        "skin_files": metadata.skin_files,
    }
