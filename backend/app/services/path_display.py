"""对外展示路径的宿主映射。

容器部署时 project_root 是 /app，直接展示容器内路径对宿主无意义——
设置 HOST_PROJECT_ROOT 后将 /app 前缀映射回宿主真实路径，前端展示、
复制出来的路径可直接在 Finder ⇧⌘G 前往。本地/Electron 模式未设置
该值，原样返回绝对路径。
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings


def display_path(path: Path) -> str:
    """返回对外展示的宿主侧绝对路径（越出 project_root 的路径原样返回）。"""
    resolved = path.resolve()
    host_root = settings.host_project_root.strip()
    if host_root:
        try:
            rel = resolved.relative_to(settings.project_root.resolve())
            return (Path(host_root) / rel).as_posix()
        except ValueError:
            pass
    return str(resolved)
