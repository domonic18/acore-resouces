"""resource_repository：mtime 指纹缓存的失效与目录隔离行为。

核心契约：Claude Code / CLI 直改 YAML 不经过 API，缓存必须在下一次
请求时通过文件指纹自动感知增删改。
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import yaml

from app.core.config import settings
from app.services import resource_repository as repo
from app.services.resource_store import _update_registry


@pytest.fixture()
def resources_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    (tmp_path / "mounts").mkdir()
    monkeypatch.setattr(settings, "resources_dir", tmp_path)
    return tmp_path


def _write_mount(dir_path: Path, resource_id: int, folder: str, name: str) -> Path:
    path = dir_path / "mounts" / f"{resource_id:04d}-{folder}.yaml"
    data = {
        "id": resource_id,
        "model_folder": folder,
        "official_db": {"name": name},
    }
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")
    return path


def _bump_mtime(path: Path, stamp_ns: int) -> None:
    os.utime(path, ns=(stamp_ns, stamp_ns))


def test_lists_sorted_by_path(resources_dir: Path) -> None:
    _write_mount(resources_dir, 2, "b", "乙")
    _write_mount(resources_dir, 1, "a", "甲")

    names = [r.official_db.name for r in repo.list_resources_cached("mount")]

    assert names == ["甲", "乙"]


def test_external_modification_detected(resources_dir: Path) -> None:
    path = _write_mount(resources_dir, 1, "a", "旧名")
    assert [r.official_db.name for r in repo.list_resources_cached("mount")] == ["旧名"]

    # 模拟外部编辑：同路径覆写内容 + 显式 mtime，不经过任何 API
    _write_mount(resources_dir, 1, "a", "新名")
    _bump_mtime(path, 2_000_000_000_000_000_000)

    assert [r.official_db.name for r in repo.list_resources_cached("mount")] == ["新名"]


def test_external_delete_detected(resources_dir: Path) -> None:
    first = _write_mount(resources_dir, 1, "a", "甲")
    _write_mount(resources_dir, 2, "b", "乙")
    assert len(repo.list_resources_cached("mount")) == 2

    first.unlink()

    names = [r.official_db.name for r in repo.list_resources_cached("mount")]
    assert names == ["乙"]


def test_directory_isolation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    dir_a = tmp_path / "a"
    dir_b = tmp_path / "b"
    for d in (dir_a, dir_b):
        (d / "mounts").mkdir(parents=True)
    _write_mount(dir_a, 1, "a", "目录A")
    _write_mount(dir_b, 1, "a", "目录B")

    monkeypatch.setattr(settings, "resources_dir", dir_a)
    assert [r.official_db.name for r in repo.list_resources_cached("mount")] == ["目录A"]

    monkeypatch.setattr(settings, "resources_dir", dir_b)
    assert [r.official_db.name for r in repo.list_resources_cached("mount")] == ["目录B"]

    # 切回目录 A：独立缓存仍在，不受目录 B 读取影响
    monkeypatch.setattr(settings, "resources_dir", dir_a)
    assert [r.official_db.name for r in repo.list_resources_cached("mount")] == ["目录A"]


def test_registry_reflects_external_changes(
    resources_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_mount(resources_dir, 1, "a", "甲")
    monkeypatch.setattr(settings, "project_root", resources_dir)
    registry_file = resources_dir / "registry.json"
    monkeypatch.setattr(settings, "registry_file", registry_file)

    _update_registry()

    assert '"mounts": 1' in registry_file.read_text(encoding="utf-8")
