"""资源文件解析服务。

根据 resource_type + model_folder 定位原始资源目录，
列出 .m2/.blp/.png/.gif 等文件，并根据 texture_variation 关联贴图。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.preview.icon_index import find_icon_path
from app.schemas.resource import Resource

RESOURCE_TYPE_TO_SOURCE_DIR = {
    "mount": "mounts",
    "pet": "pets",
    "npc": "npcs",
}

ASSET_EXTENSIONS = {".m2", ".blp", ".png", ".gif", ".anim"}


@dataclass
class AssetFile:
    """资源目录中的单个文件。"""

    name: str
    relative_path: str
    absolute_path: Path
    file_type: str


@dataclass
class ResolvedAssets:
    """资源解析结果。"""

    model_folder: str
    resource_dir: Path
    m2_files: list[AssetFile]
    texture_files: list[AssetFile]
    image_files: list[AssetFile]
    icon_files: list[AssetFile]
    matched_textures: list[AssetFile]
    anim_files: list[AssetFile]

    @property
    def exists(self) -> bool:
        """资源目录是否存在。"""
        return self.resource_dir.exists()


def resolve_resource_dir(resource_type: str, model_folder: str) -> Path:
    """根据资源类型和模型文件夹名定位原始资源目录。

    Args:
        resource_type: 资源类型：mount/pet/npc。
        model_folder: 模型文件夹名。

    Returns:
        原始资源目录绝对路径。
    """
    subdir = RESOURCE_TYPE_TO_SOURCE_DIR.get(resource_type, f"{resource_type}s")
    return settings.sources_dir / subdir / model_folder


def list_asset_files(resource_dir: Path) -> list[AssetFile]:
    """列出资源目录及其子目录下的所有相关文件。

    Args:
        resource_dir: 资源目录路径。

    Returns:
        AssetFile 列表，按相对路径排序。
    """
    if not resource_dir.exists():
        return []

    files: list[AssetFile] = []
    for file_path in sorted(resource_dir.rglob("*")):
        if not file_path.is_file():
            continue
        suffix = file_path.suffix.lower()
        if suffix not in ASSET_EXTENSIONS:
            continue

        try:
            rel_path = file_path.relative_to(settings.project_root)
        except ValueError:
            rel_path = file_path

        files.append(
            AssetFile(
                name=file_path.name,
                relative_path=str(rel_path),
                absolute_path=file_path,
                file_type=suffix.lstrip("."),
            )
        )
    return files


def _extract_texture_variations(resource: Resource) -> list[str]:
    """从资源定义中提取贴图变体名称列表。"""
    variations: list[str] = []
    dbc_info = resource.dbc
    if not dbc_info:
        return variations

    display_info = getattr(dbc_info, "creature_display_info", None) or {}
    if isinstance(display_info, dict):
        for key in ("texture_variation_1", "texture_variation_2", "texture_variation_3"):
            value = display_info.get(key)
            if value and isinstance(value, str):
                variations.append(value)
    return variations


def _match_texture_files(
    texture_files: list[AssetFile],
    variations: list[str],
) -> list[AssetFile]:
    """根据变体名称匹配贴图文件。

    匹配规则：文件名包含变体名称（忽略大小写），每个变体只取第一个匹配。
    """
    matched: list[AssetFile] = []
    used: set[str] = set()

    for variation in variations:
        var_lower = variation.lower()
        for asset in texture_files:
            if asset.name.lower() in used:
                continue
            if var_lower in asset.name.lower():
                matched.append(asset)
                used.add(asset.name)
                break

    return matched


def resolve_resource_assets(resource: Resource) -> ResolvedAssets:
    """解析资源的所有相关文件。

    Args:
        resource: 资源对象。

    Returns:
        ResolvedAssets，包含 M2、贴图、图片、图标及匹配到的贴图。
    """
    resource_dir = resolve_resource_dir(resource.resource_type, resource.model_folder)
    files = list_asset_files(resource_dir)

    m2_files = [f for f in files if f.file_type == "m2"]
    texture_files = [f for f in files if f.file_type == "blp"]
    image_files = [f for f in files if f.file_type in ("png", "gif")]
    anim_files = [f for f in files if f.file_type == "anim"]

    variations = _extract_texture_variations(resource)
    matched_textures = _match_texture_files(texture_files, variations)

    icon_files: list[AssetFile] = []
    for icon_name in (
        resource.official_db.icon_name,
        resource.official_db.spell_icon_name,
    ):
        icon_path = find_icon_path(icon_name)
        if icon_path and icon_path.exists():
            try:
                rel_path = icon_path.relative_to(settings.project_root)
            except ValueError:
                rel_path = icon_path
            icon_files.append(
                AssetFile(
                    name=icon_path.name,
                    relative_path=str(rel_path),
                    absolute_path=icon_path,
                    file_type="blp",
                )
            )

    return ResolvedAssets(
        model_folder=resource.model_folder,
        resource_dir=resource_dir,
        m2_files=m2_files,
        texture_files=texture_files,
        image_files=image_files,
        icon_files=icon_files,
        matched_textures=matched_textures,
        anim_files=anim_files,
    )


def resolve_textures_by_variation(
    resource_type: str,
    model_folder: str,
    variations: list[str | None],
) -> list[Path]:
    """根据模型文件夹和贴图变体名称解析本地 .blp 文件路径。

    Args:
        resource_type: 资源类型。
        model_folder: 模型文件夹名。
        variations: 贴图变体名称列表。

    Returns:
        匹配到的 .blp 文件路径列表。
    """
    resource_dir = resolve_resource_dir(resource_type, model_folder)
    if not resource_dir.exists():
        return []

    results: list[Path] = []
    used: set[str] = set()
    blp_files = sorted(resource_dir.glob("*.blp"))

    for variation in variations:
        if not variation:
            continue
        var_lower = variation.lower()
        for blp_path in blp_files:
            if blp_path.name in used:
                continue
            if var_lower in blp_path.name.lower():
                results.append(blp_path)
                used.add(blp_path.name)
                break

    return results
