"""BLP 解码服务单元测试。"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.preview.blp_decoder import decode_blp_to_image, decode_blp_to_webp

REAL_BLP = settings.sources_dir / "icons" / "interface" / "icons" / "inv_hippo_green.blp"


@pytest.mark.skipif(not REAL_BLP.exists(), reason="缺少真实 BLP 源文件")
def test_decode_blp_to_image() -> None:
    image = decode_blp_to_image(REAL_BLP)
    assert image.size == (64, 64)
    assert image.mode == "RGBA"


@pytest.mark.skipif(not REAL_BLP.exists(), reason="缺少真实 BLP 源文件")
def test_decode_blp_to_webp(tmp_path: Path) -> None:
    output = tmp_path / "output.webp"
    result = decode_blp_to_webp(REAL_BLP, output)
    assert result == output
    assert output.exists()
    assert output.stat().st_size > 0


def test_decode_missing_file() -> None:
    missing = Path("/nonexistent/missing.blp")
    with pytest.raises(FileNotFoundError):
        decode_blp_to_image(missing)
