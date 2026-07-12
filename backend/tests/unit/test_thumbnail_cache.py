"""缩略图缓存服务单元测试。"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.preview.thumbnail_cache import (
    clear_thumbnails,
    get_or_create_thumbnail,
    get_thumbnail_path,
    is_cache_valid,
)

REAL_BLP = settings.sources_dir / "icons" / "interface" / "icons" / "inv_hippo_green.blp"


@pytest.mark.skipif(not REAL_BLP.exists(), reason="缺少真实 BLP 源文件")
def test_get_thumbnail_path() -> None:
    path = get_thumbnail_path(REAL_BLP, size=(64, 64))
    assert "64x64" in str(path)
    assert str(path).endswith("inv_hippo_green.blp.webp")


@pytest.mark.skipif(not REAL_BLP.exists(), reason="缺少真实 BLP 源文件")
def test_cache_miss_then_hit(tmp_path: Path) -> None:
    from app.core.config import settings

    original_thumbnails_dir = settings.thumbnails_dir
    settings.thumbnails_dir = tmp_path
    try:
        cache_path = get_or_create_thumbnail(REAL_BLP, size=(32, 32))
        assert cache_path.exists()

        # 缓存应被判定为有效
        assert is_cache_valid(cache_path, REAL_BLP) is True

        # 第二次调用直接返回缓存
        second = get_or_create_thumbnail(REAL_BLP, size=(32, 32))
        assert second == cache_path
    finally:
        settings.thumbnails_dir = original_thumbnails_dir


@pytest.mark.skipif(not REAL_BLP.exists(), reason="缺少真实 BLP 源文件")
def test_clear_thumbnails(tmp_path: Path) -> None:
    from app.core.config import settings

    original_thumbnails_dir = settings.thumbnails_dir
    settings.thumbnails_dir = tmp_path
    try:
        cache = get_or_create_thumbnail(REAL_BLP, size=(16, 16))
        assert cache.exists()
        count = clear_thumbnails(size=(16, 16))
        assert count >= 1
        assert not cache.exists()
    finally:
        settings.thumbnails_dir = original_thumbnails_dir
