"""M2 元数据读取服务单元测试。"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.preview.m2_reader import (
    M2Metadata,
    read_m2_metadata,
)

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures"
SAMPLE_M2 = FIXTURES_DIR / "sample.m2"


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
