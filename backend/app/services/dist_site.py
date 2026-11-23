"""分发站点服务：以 workspace/dist/ 为玩家下载真相源。

发布（publish）落盘即上架：dist 下带 manifest.json 的批次对玩家可见，
无需任何推送动作。changelog 的真相源是批次目录下的 changelog.md 文件
（manifest 中不存冗余字段），元数据修改同步回写该文件。
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

from app.core.config import settings

DIST_DIR = settings.workspace_dir / "dist"
BATCH_NAME_RE = re.compile(r"^\d{8}_\d{6}$")

# manifest 中发布时回写的字段；对外暴露时 patch_* 前缀去掉，
# 与旧分发站 meta.json 的对外字段名（size_bytes/md5）保持兼容
_PATCH_FIELDS = ("patch_number", "patch_file", "patch_size_bytes", "patch_sha256", "patch_md5")
_PATCH_FIELD_MAP = {
    "patch_number": "patch_number",
    "patch_file": "patch_file",
    "patch_size_bytes": "size_bytes",
    "patch_md5": "md5",
    "patch_sha256": "sha256",
}

# PATCH-able 元数据字段（changelog 真相源是 changelog.md 文件）
EDITABLE_META_FIELDS = ("changelog", "mount_count", "file_count", "generated_at")


class DistSiteError(Exception):
    """分发站点操作失败（批次不存在/非法等）。"""


class BatchNotFoundError(DistSiteError):
    """批次不存在。"""


def _batch_meta(batch_dir: Path) -> dict[str, Any]:
    """读取批次 manifest 的对外字段（含发布信息映射），manifest 缺失/损坏时仅报基本盘。"""
    meta: dict[str, Any] = {
        "batch": batch_dir.name,
        "obfuscation": None,
        "generated_at": None,
        "mount_count": None,
        "file_count": None,
        "patch_number": None,
        "patch_file": None,
        "size_bytes": None,
        "md5": None,
        "sha256": None,
    }
    manifest = batch_dir / "manifest.json"
    if manifest.is_file():
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = None
        if isinstance(data, dict):
            meta["batch"] = data.get("batch") or batch_dir.name
            meta["obfuscation"] = data.get("obfuscation")
            meta["generated_at"] = data.get("generated_at")
            meta["mount_count"] = data.get("mount_count")
            meta["file_count"] = data.get("file_count")
            for field, out_name in _PATCH_FIELD_MAP.items():
                meta[out_name] = data.get(field)
    mpq = next(batch_dir.glob("patch-zhCN-*.mpq"), None)
    meta["has_mpq"] = mpq is not None
    meta["has_changelog"] = (batch_dir / "changelog.md").is_file()
    return meta


def _is_listed(batch_dir: Path) -> bool:
    """玩家可见判定：manifest 存在且含发布信息（patch_number）。

    构建产物落在 workspace/mpq/，只有发布到 dist 才会写 patch_number，
    以此区分「已上架」与「临时/失败目录」。
    """
    return _batch_meta(batch_dir).get("patch_number") is not None


def list_batches(listed_only: bool = True) -> list[dict[str, Any]]:
    """列出 dist 下全部批次摘要（按批次名升序）。"""
    if not DIST_DIR.exists():
        return []
    items: list[dict[str, Any]] = []
    for batch_dir in sorted(DIST_DIR.iterdir()):
        if not batch_dir.is_dir() or not BATCH_NAME_RE.match(batch_dir.name):
            continue
        meta = _batch_meta(batch_dir)
        if listed_only and not _is_listed(batch_dir):
            continue
        items.append(meta)
    return items


def list_admin_batches() -> dict[str, Any]:
    """admin 视角批次清单：全部批次 + 孤儿目录（无合法批次名）。"""
    batches = list_batches(listed_only=False)
    orphans: list[str] = []
    if DIST_DIR.exists():
        known = {b["batch"] for b in batches}
        for entry in sorted(DIST_DIR.iterdir()):
            if entry.is_dir() and entry.name not in known:
                orphans.append(entry.name)
    return {"batches": batches, "orphans": orphans}


def get_batch(batch: str) -> dict[str, Any]:
    """读取单个批次元数据。

    Raises:
        BatchNotFoundError: 批次名非法或目录不存在。
    """
    _validate_batch_name(batch)
    batch_dir = DIST_DIR / batch
    if not batch_dir.is_dir():
        raise BatchNotFoundError(f"批次 {batch} 不存在")
    return _batch_meta(batch_dir)


def read_changelog(batch: str) -> str:
    """读取批次玩家公告（changelog.md 真相源）。

    Raises:
        BatchNotFoundError: 批次不存在或没有 changelog。
    """
    _validate_batch_name(batch)
    path = DIST_DIR / batch / "changelog.md"
    if not path.is_file():
        raise BatchNotFoundError(f"批次 {batch} 没有 changelog")
    return path.read_text(encoding="utf-8")


def update_batch_meta(batch: str, updates: dict[str, Any]) -> dict[str, Any]:
    """更新批次可编辑元数据；changelog 写回 changelog.md 文件。

    Args:
        batch: 批次名。
        updates: 仅含 EDITABLE_META_FIELDS 中非空字段的字典。

    Returns:
        更新后的批次元数据。

    Raises:
        BatchNotFoundError: 批次不存在。
        DistSiteError: 更新字段为空或 manifest 损坏。
    """
    current = get_batch(batch)
    if not updates:
        raise DistSiteError("没有要更新的字段")

    batch_dir = DIST_DIR / batch
    if "changelog" in updates:
        changelog_path = batch_dir / "changelog.md"
        changelog_path.write_text(str(updates["changelog"]), encoding="utf-8")
        current["has_changelog"] = True

    manifest = batch_dir / "manifest.json"
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise json.JSONDecodeError("not a dict", "", 0)
    except (OSError, json.JSONDecodeError) as e:
        raise DistSiteError(f"批次 {batch} manifest 损坏，无法更新：{e}") from e

    changed = False
    for field in ("mount_count", "file_count", "generated_at"):
        if field in updates:
            data[field] = updates[field]
            changed = True
    if changed:
        manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    return _batch_meta(batch_dir)


def delete_batch(batch: str) -> dict[str, Any]:
    """下线批次：删除整个批次目录（玩家立即不可见）。

    Returns:
        {batch, existed, freed_bytes}。
    """
    _validate_batch_name(batch)
    batch_dir = DIST_DIR / batch
    if not batch_dir.is_dir():
        return {"batch": batch, "existed": False, "freed_bytes": 0}
    freed = sum(f.stat().st_size for f in batch_dir.rglob("*") if f.is_file())
    shutil.rmtree(batch_dir)
    return {"batch": batch, "existed": True, "freed_bytes": freed}


def build_dist_tree() -> dict[str, Any]:
    """构建玩家下载树：根节点下每批次一个目录节点 + MPQ 文件节点。

    节点形状与旧分发站 /api/dist/tree 一致（name/path/type/meta/children），
    path 相对 dist 根，下载端点据此解析。
    """
    root: dict[str, Any] = {
        "name": "root",
        "path": "",
        "type": "dir",
        "meta": None,
        "children": [],
    }
    if not DIST_DIR.exists():
        return root

    for meta in list_batches(listed_only=True):
        batch = str(meta["batch"])
        batch_dir = DIST_DIR / batch
        children: list[dict[str, Any]] = []
        for entry in sorted(batch_dir.iterdir()):
            if not entry.is_file():
                continue
            if entry.suffix.lower() == ".mpq":
                children.append(
                    {
                        "name": entry.name,
                        "path": f"{batch}/{entry.name}",
                        "type": "file",
                        "meta": {
                            "size_bytes": entry.stat().st_size,
                            "md5": meta.get("md5"),
                            "sha256": meta.get("sha256"),
                            "patch_number": meta.get("patch_number"),
                        },
                        "children": [],
                    }
                )
            elif entry.name == "readme.txt":
                children.append(
                    {
                        "name": entry.name,
                        "path": f"{batch}/{entry.name}",
                        "type": "file",
                        "meta": {"size_bytes": entry.stat().st_size},
                        "children": [],
                    }
                )
        root["children"].append(
            {
                "name": batch,
                "path": batch,
                "type": "dir",
                "meta": meta,
                "children": children,
            }
        )
    return root


def resolve_download(path: str) -> Path:
    """把树内相对路径安全解析为 dist 下真实文件路径（仅 .mpq）。

    Raises:
        DistSiteError: 路径穿越、目录、非 .mpq 文件或文件不存在。
    """
    if "\x00" in path:
        raise DistSiteError("非法路径")
    target = (DIST_DIR / path).resolve()
    dist_root = DIST_DIR.resolve()
    if not target.is_relative_to(dist_root):
        raise DistSiteError("路径越界")
    if target.is_dir() or not target.is_file():
        raise DistSiteError(f"文件不存在：{path}")
    if target.suffix.lower() != ".mpq":
        raise DistSiteError("仅允许下载 .mpq 文件")
    return target


def _validate_batch_name(batch: str) -> None:
    if not BATCH_NAME_RE.match(batch):
        raise BatchNotFoundError(f"非法批次名：{batch}")
