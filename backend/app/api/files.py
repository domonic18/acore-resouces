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


class _TreeNode:
    def __init__(
        self,
        name: str,
        path: str,
        node_type: str,
        children: list[dict[str, Any]] | None = None,
    ) -> None:
        self.name = name
        self.path = path
        self.type = node_type
        self.children = children

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": self.name,
            "path": self.path,
            "type": self.type,
        }
        if self.children is not None:
            result["children"] = self.children
        return result


def _build_tree(
    path: Path, relative_prefix: str, max_depth: int, current_depth: int = 0
) -> dict[str, Any] | None:
    """递归构建目录树，支持深度限制。

    Args:
        path: 当前文件或目录路径。
        relative_prefix: 用于返回的相对路径前缀。
        max_depth: 最大递归深度；0 表示仅当前节点。
        current_depth: 当前深度。

    Returns:
        目录树节点字典，若路径不存在则返回 None。
    """
    if not path.exists():
        return None

    name = path.name or relative_prefix
    node_type = "directory" if path.is_dir() else "file"

    if path.is_dir():
        children: list[dict[str, Any]] = []
        if current_depth < max_depth:
            try:
                entries = sorted(
                    path.iterdir(),
                    key=lambda p: (not p.is_dir(), p.name.lower()),
                )
            except OSError:
                entries = []
            for entry in entries:
                child = _build_tree(
                    entry,
                    f"{relative_prefix}/{entry.name}" if relative_prefix else entry.name,
                    max_depth,
                    current_depth + 1,
                )
                if child is not None:
                    children.append(child)
        return _TreeNode(name, relative_prefix, node_type, children).to_dict()

    return _TreeNode(name, relative_prefix, node_type).to_dict()


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
