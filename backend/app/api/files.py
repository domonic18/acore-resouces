"""文件系统目录树 API 路由。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings

router = APIRouter(prefix="/api/files", tags=["files"])


_ALLOWED_ROOTS: dict[str, Path] = {
    "sources": settings.sources_dir,
    "resources": settings.resources_dir,
}

_DEFAULT_MAX_CHILDREN = 500


class _TreeNode:
    def __init__(
        self,
        name: str,
        path: str,
        node_type: str,
        children: list[dict[str, Any]] | None = None,
        truncated: bool = False,
    ) -> None:
        self.name = name
        self.path = path
        self.type = node_type
        self.children = children
        self.truncated = truncated

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": self.name,
            "path": self.path,
            "type": self.type,
        }
        if self.children is not None:
            result["children"] = self.children
        if self.truncated:
            result["truncated"] = self.truncated
        return result


def _safe_iterdir(path: Path) -> list[Path]:
    """安全读取目录内容，跳过符号链接并容错权限错误。"""
    try:
        entries = [e for e in path.iterdir() if not e.is_symlink()]
    except OSError:
        return []
    return sorted(entries, key=lambda p: (not p.is_dir(), p.name.lower()))


def _build_tree(
    path: Path,
    relative_prefix: str,
    max_depth: int,
    current_depth: int = 0,
    max_children: int = _DEFAULT_MAX_CHILDREN,
) -> dict[str, Any] | None:
    """递归构建目录树，支持深度限制与子项数上限。

    Args:
        path: 当前文件或目录路径。
        relative_prefix: 用于返回的相对路径前缀。
        max_depth: 最大递归深度；0 表示仅当前节点。
        current_depth: 当前深度。
        max_children: 每个目录最多返回的子项数量。

    Returns:
        目录树节点字典，若路径不存在则返回 None。
    """
    if not path.exists():
        return None

    name = path.name or relative_prefix
    node_type = "directory" if path.is_dir() else "file"

    if path.is_dir():
        children: list[dict[str, Any]] = []
        truncated = False
        if current_depth < max_depth:
            entries = _safe_iterdir(path)
            if len(entries) > max_children:
                entries = entries[:max_children]
                truncated = True
            for entry in entries:
                child_prefix = f"{relative_prefix}/{entry.name}" if relative_prefix else entry.name
                child = _build_tree(
                    entry,
                    child_prefix,
                    max_depth,
                    current_depth + 1,
                    max_children,
                )
                if child is not None:
                    children.append(child)
            return _TreeNode(name, relative_prefix, node_type, children, truncated).to_dict()
        return _TreeNode(name, relative_prefix, node_type, None, truncated).to_dict()

    return _TreeNode(name, relative_prefix, node_type).to_dict()


def _resolve_tree_path(root: str, relative_path: str) -> Path:
    """校验并解析允许根目录下的相对路径。

    Args:
        root: 根目录标识，必须是 _ALLOWED_ROOTS 的键。
        relative_path: 相对 root 的路径。

    Returns:
        校验通过的绝对目录路径。

    Raises:
        HTTPException: 根目录无效、路径越界、目标不是目录时抛出。
    """
    if root not in _ALLOWED_ROOTS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的根目录：{root}。允许的值为：{', '.join(_ALLOWED_ROOTS)}",
        )

    base = _ALLOWED_ROOTS[root].resolve()
    target = (base / relative_path).resolve()

    try:
        target.relative_to(base)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="非法路径") from exc

    if not target.is_dir():
        raise HTTPException(status_code=404, detail=f"目录不存在：{relative_path}")

    return target


@router.get("/tree")
def get_file_tree(
    root: str = Query("sources", description="根目录：sources 或 resources"),
    depth: int = Query(2, ge=1, le=5, description="递归深度"),
) -> dict[str, Any]:
    """获取指定根目录的文件夹树结构。"""
    if root not in _ALLOWED_ROOTS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的根目录：{root}。允许的值为：{', '.join(_ALLOWED_ROOTS)}",
        )

    base_path = _ALLOWED_ROOTS[root]
    tree = _build_tree(base_path, root, depth)
    if tree is None:
        raise HTTPException(status_code=404, detail=f"根目录不存在：{root}")

    return tree


@router.get("/tree/{root}")
def get_file_subtree(
    root: str,
    path: str = Query("", description="相对 root 的路径，如 mounts/foo"),
    depth: int = Query(1, ge=1, le=3, description="递归深度"),
) -> dict[str, Any]:
    """获取指定路径下的文件夹树结构，用于懒加载深层目录。"""
    target = _resolve_tree_path(root, path)
    prefix = f"{root}/{path}" if path else root
    tree = _build_tree(target, prefix, depth)
    if tree is None:
        raise HTTPException(status_code=404, detail=f"路径不存在：{path}")

    return tree
