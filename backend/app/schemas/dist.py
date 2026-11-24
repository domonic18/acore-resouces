"""分发站响应模型（/api/dist* 的 DTO 单一真相源，字段与前端 shared/dist.ts 镜像）。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DistBatchMeta(BaseModel):
    """一个分发批次摘要。"""

    batch: str
    obfuscation: str | None = None
    generated_at: str | None = None
    mount_count: int | None = None
    file_count: int | None = None
    patch_number: int | None = None
    patch_file: str | None = None
    size_bytes: int | None = None
    md5: str | None = None
    sha256: str | None = None
    has_mpq: bool = False
    has_changelog: bool = False


class DistAdminBatchesOut(BaseModel):
    """admin 视角批次清单（含未上架目录与孤儿目录）。"""

    batches: list[DistBatchMeta] = Field(default_factory=list)
    orphans: list[str] = Field(default_factory=list)


class DistFileMeta(BaseModel):
    """树中文件节点元数据（MPQ 带哈希与补丁号，readme 仅大小）。"""

    size_bytes: int
    md5: str | None = None
    sha256: str | None = None
    patch_number: int | None = None


class DistTreeNode(BaseModel):
    """玩家下载树节点（形状与旧分发站 /api/dist/tree 一致）。"""

    name: str
    path: str
    type: Literal["dir", "file"]
    meta: DistBatchMeta | DistFileMeta | None = None
    children: list[DistTreeNode] = Field(default_factory=list)


class DistChangelogOut(BaseModel):
    """批次玩家公告（Markdown 正文）。"""

    batch: str
    changelog: str


class DistBatchDeleteOut(BaseModel):
    """批次下线结果。"""

    batch: str
    existed: bool
    freed_bytes: int
