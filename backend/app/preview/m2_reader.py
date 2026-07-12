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

# 已验证可完整解析的 M2 版本号（当前为 WotLK 3.3.5a）
SUPPORTED_FULL_VERSIONS = {263}


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


def _parse_wotlk_metadata(m2_path: Path, data: bytes) -> M2Metadata:
    """解析 WotLK 版本（263）M2 的完整元数据。

    标准头布局（起始偏移 0x14 = 20）：
    0: nGlobalSequences, 1: ofsGlobalSequences
    2: nAnimations,      3: ofsAnimations
    4: nAnimationLookup, 5: ofsAnimationLookup
    6: nBones,           7: ofsBones
    8: nKeyBoneLookup,   9: ofsKeyBoneLookup
    10: nVertices,       11: ofsVertices
    12: nViews,          13: ofsViews
    14: nColors,         15: ofsColors
    16: nTextures,       17: ofsTextures
    """
    offsets = struct.unpack_from("<" + "I" * 26, data, 20)
    n_vertices = offsets[10]
    n_animations = offsets[2]
    n_textures = offsets[16]
    ofs_textures = offsets[17]

    textures: list[M2TextureInfo] = []
    for i in range(n_textures):
        entry_offset = ofs_textures + i * 16
        if entry_offset + 16 > len(data):
            break
        tex_type, tex_flags, filename_length, filename_offset = struct.unpack_from(
            "<IIII", data, entry_offset
        )
        filename = _read_c_string(data, filename_offset, filename_length)
        textures.append(
            M2TextureInfo(texture_type=tex_type, flags=tex_flags, filename=filename)
        )

    version, _, name = _parse_header_name(data)
    return M2Metadata(
        version=version,
        name=name,
        file_size=len(data),
        vertices_count=n_vertices,
        animations_count=n_animations,
        textures_count=n_textures,
        textures=textures,
        skin_files=_read_skin_files(m2_path),
    )


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
        return _parse_wotlk_metadata(m2_path, data)

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
        "skin_files": metadata.skin_files,
    }
