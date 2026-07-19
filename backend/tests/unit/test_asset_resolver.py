"""资源文件解析服务单元测试。"""

from __future__ import annotations

from pathlib import Path

from app.preview.asset_resolver import (
    list_asset_files,
    resolve_resource_assets,
    resolve_resource_dir,
    resolve_textures_by_variation,
)
from app.schemas.resource import Mount, OfficialDbInfo


def test_resolve_resource_dir() -> None:
    path = resolve_resource_dir("mount", "test_folder")
    assert "mounts" in str(path)
    assert "test_folder" in str(path)


def test_list_asset_files_empty() -> None:
    assert list_asset_files(Path("/nonexistent/path")) == []


def test_resolve_resource_assets_for_missing_dir() -> None:
    resource = Mount(
        id=99999,
        model_folder="__missing_folder_for_test__",
        official_db=OfficialDbInfo(),
    )
    assets = resolve_resource_assets(resource)
    assert assets.exists is False
    assert assets.m2_files == []


def test_resolve_textures_by_variation(tmp_path: Path) -> None:
    # 创建临时目录结构
    resource_dir = tmp_path / "mounts" / "test_mount"
    resource_dir.mkdir(parents=True)
    (resource_dir / "skin_blue.blp").write_text("dummy")
    (resource_dir / "skin_red.blp").write_text("dummy")

    from app.core.config import settings

    original_sources = settings.sources_dir
    settings.sources_dir = tmp_path
    try:
        results = resolve_textures_by_variation("mount", "test_mount", ["blue", "red"])
        assert len(results) == 2
        assert any("blue" in str(r) for r in results)
        assert any("red" in str(r) for r in results)
    finally:
        settings.sources_dir = original_sources
