"""path_display 宿主路径映射单元测试。"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import Settings
from app.services import path_display


@pytest.fixture
def host_mapped(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """模拟容器部署：project_root=/app（tmp），宿主根=/Users/demo/proj（tmp）。"""
    app_root = tmp_path / "app"
    host_root = tmp_path / "host" / "proj"
    app_root.mkdir()
    host_root.mkdir(parents=True)
    patched = Settings()
    patched.project_root = app_root
    patched.host_project_root = str(host_root)
    monkeypatch.setattr(path_display, "settings", patched)
    return app_root


def test_no_host_root_returns_absolute(tmp_path: Path) -> None:
    patched = Settings()
    patched.project_root = tmp_path
    patched.host_project_root = ""
    with pytest.MonkeyPatch().context() as m:
        m.setattr(path_display, "settings", patched)
        result = path_display.display_path(tmp_path / "workspace" / "mpq")
    assert result == str((tmp_path / "workspace" / "mpq").resolve())


def test_host_root_maps_prefix(host_mapped: Path) -> None:
    target = host_mapped / "workspace" / "mpq" / "b1" / "patch.mpq"
    result = path_display.display_path(target)
    assert result.endswith("/host/proj/workspace/mpq/b1/patch.mpq")
    assert "/app" not in result


def test_host_root_outside_project_root_passthrough(host_mapped: Path) -> None:
    outside = host_mapped.parent / "elsewhere" / "x.txt"
    result = path_display.display_path(outside)
    assert result == str(outside.resolve())


def test_blank_host_root_ignored(host_mapped: Path) -> None:
    patched = Settings()
    patched.project_root = host_mapped
    patched.host_project_root = "   "
    with pytest.MonkeyPatch().context() as m:
        m.setattr(path_display, "settings", patched)
        result = path_display.display_path(host_mapped / "data")
    assert result == str((host_mapped / "data").resolve())
