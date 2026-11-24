"""资源 YAML 进程内仓库（列表读路径缓存）。

YAML 是唯一真相源，Claude Code / CLI 直改文件不经过 API，因此缓存以
(st_mtime_ns, st_size) 指纹失效：每次读取先 scandir 扫描（毫秒级），
仅重新解析变化的文件，外部编辑在下一次请求自动感知。
缓存键含 resources_dir 绝对路径，测试 monkeypatch 临时目录天然隔离。
"""

from __future__ import annotations

import os
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, NamedTuple, cast

import yaml

from app.core.config import settings
from app.models.resource import Mount, Npc, Pet
from app.schemas.resource import Mount as MountSchema
from app.schemas.resource import Npc as NpcSchema
from app.schemas.resource import Pet as PetSchema
from app.schemas.resource import Resource

RESOURCE_TYPE_MAP: dict[str, tuple[Any, type]] = {
    "mounts": (Mount, MountSchema),
    "pets": (Pet, PetSchema),
    "npcs": (Npc, NpcSchema),
}

TYPE_TO_DIR = {
    "mount": "mounts",
    "pet": "pets",
    "npc": "npcs",
}


def _file_timestamps(path: Path) -> tuple[datetime | None, datetime | None]:
    """从文件系统读取资源的创建时间与修改时间。

    创建时间优先使用 st_birthtime；在 Linux 等不支持的环境中回退到 st_ctime。
    返回 (created_at, updated_at) 的 UTC 时间。
    """
    try:
        stat = path.stat()
        created = getattr(stat, "st_birthtime", stat.st_ctime)
        return (
            datetime.fromtimestamp(created, tz=UTC),
            datetime.fromtimestamp(stat.st_mtime, tz=UTC),
        )
    except OSError:
        return None, None


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return cast(dict[str, Any], yaml.safe_load(f) or {})


_Fingerprint = tuple[int, int]


class _Entry(NamedTuple):
    fingerprint: _Fingerprint
    resource: Resource


_entries: dict[tuple[str, str], dict[Path, _Entry]] = {}
_refresh_locks: dict[tuple[str, str], threading.Lock] = {}
_registry_lock = threading.Lock()


def _cache_key(resource_type: str) -> tuple[str, str]:
    plural = TYPE_TO_DIR.get(resource_type, resource_type + "s")
    return plural, str(settings.resources_dir / plural)


def _scan_fingerprints(dir_path: Path) -> dict[Path, _Fingerprint]:
    """目录存在性容错：目录缺失视为空集（与 glob 行为一致）。"""
    fingerprints: dict[Path, _Fingerprint] = {}
    try:
        with os.scandir(dir_path) as it:
            for entry in it:
                if entry.is_file() and entry.name.endswith(".yaml"):
                    st = entry.stat()
                    fingerprints[Path(entry.path)] = (st.st_mtime_ns, st.st_size)
    except FileNotFoundError:
        return {}
    return fingerprints


def _refresh(key: tuple[str, str]) -> dict[Path, _Entry]:
    """按指纹差异增量重建缓存；调用方必须持有该 key 的刷新锁。"""
    plural = key[0]
    dir_path = Path(key[1])
    _, schema_cls = RESOURCE_TYPE_MAP[plural]
    current = _scan_fingerprints(dir_path)
    cached = _entries.get(key)
    if (
        cached is not None
        and {path: entry.fingerprint for path, entry in cached.items()} == current
    ):
        return cached
    built: dict[Path, _Entry] = {}
    for path in sorted(current):
        data = _load_yaml(path)
        data["created_at"], data["updated_at"] = _file_timestamps(path)
        built[path] = _Entry(current[path], cast(Resource, schema_cls(**data)))
    _entries[key] = built
    return built


def _with_refresh_lock(resource_type: str) -> dict[Path, _Entry]:
    key = _cache_key(resource_type)
    with _registry_lock:
        lock = _refresh_locks.setdefault(key, threading.Lock())
    with lock:
        return _refresh(key)


def list_resources_cached(resource_type: str) -> list[Resource]:
    """返回该类型全部资源（路径排序），外部 YAML 修改自动感知。"""
    entries = _with_refresh_lock(resource_type)
    return [entry.resource for _, entry in sorted(entries.items())]


def iter_entries(resource_type: str) -> list[tuple[Path, Resource]]:
    """返回 (文件路径, 资源) 列表（路径排序），供 registry 等需要文件位置的调用方。"""
    entries = _with_refresh_lock(resource_type)
    return [(path, entry.resource) for path, entry in sorted(entries.items())]
