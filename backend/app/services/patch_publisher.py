"""MPQ 补丁发布服务。

扫描 `workspace/mpq/` 下的批次构建结果，将每个未发布的批次移动到
`workspace/dist/{batch_name}/` 下，并将 MPQ 文件重命名为魔兽世界客户端
补丁命名方式 `patch-zhCN-{number}.mpq`。

发布为移动语义：`.mpq` 大文件移动（不重复占用磁盘），`manifest.json`、
`readme.txt`、`listfile.txt`、`changelog.md` 等元数据随发布复制到 dist
（MPQ 查看器依赖 manifest 提供混淆等级与文件清单、changelog 提供变更
日志浏览）；发布成功后清理构建侧批次目录。
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.patch_distro_client import (
    DistroPushError,
    is_distro_configured,
    push_batch,
)

MPQ_DIR = settings.project_root / "workspace" / "mpq"
DIST_DIR = settings.project_root / "workspace" / "dist"
DEFAULT_START_NUMBER = 5
_HASH_CHUNK = 1024 * 1024


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(_HASH_CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


class PatchPublisherError(Exception):
    """补丁发布过程中的通用错误。"""


def collect_source_batches() -> list[Path]:
    """收集 workspace/mpq/ 下包含 patch-*.mpq 的批次目录。"""
    if not MPQ_DIR.exists():
        return []

    batches: list[Path] = []
    for batch_dir in sorted(MPQ_DIR.iterdir()):
        if not batch_dir.is_dir():
            continue
        mpq_files = list(batch_dir.glob("patch-*.mpq"))
        if mpq_files:
            batches.append(batch_dir)
    return batches


def is_batch_published(batch_dir: Path, dist_dir: Path) -> bool:
    """检查该批次是否已经在 dist 中发布。"""
    target_dir = dist_dir / batch_dir.name
    return target_dir.exists() and any(target_dir.glob("patch-zhCN-*.mpq"))


# 随发布复制到 dist 的元数据文件（MPQ 查看器枚举/混淆等级依赖 manifest）
METADATA_FILES = ("manifest.json", "readme.txt", "listfile.txt", "changelog.md")


def publish_batch(batch_dir: Path, dist_dir: Path, number: int) -> Path:
    """发布单个批次到分发目录（移动语义），返回发布后的 MPQ 路径。

    元数据先复制、MPQ 后移动：中途失败时 dist 侧不完整（is_batch_published
    判定未发布），重跑发布可自愈；全部成功后清理构建侧批次目录。

    Args:
        batch_dir: workspace/mpq/ 下的批次目录。
        dist_dir: workspace/dist/ 分发目录。
        number: 分配的 patch-zhCN 编号。

    Returns:
        发布后的 MPQ 路径。

    Raises:
        PatchPublisherError: 批次中没有 MPQ 文件。
    """
    mpq_sources = list(batch_dir.glob("patch-*.mpq"))
    if not mpq_sources:
        raise PatchPublisherError(f"批次 {batch_dir.name} 中没有找到 MPQ 文件")

    target_dir = dist_dir / batch_dir.name
    target_dir.mkdir(parents=True, exist_ok=True)

    for name in METADATA_FILES:
        source = batch_dir / name
        if source.is_file():
            shutil.copy2(source, target_dir / name)

    mpq_source = mpq_sources[0]
    mpq_target = target_dir / f"patch-zhCN-{number}.mpq"
    patch_sha256 = _sha256_file(mpq_source)
    shutil.move(str(mpq_source), str(mpq_target))

    # 回写发布信息到 dist 侧 manifest：序号/文件名/大小/校验和，
    # 供 MPQ 查看器与分发端推送（distro-push）直接消费
    target_manifest = target_dir / "manifest.json"
    if target_manifest.is_file():
        try:
            data = json.loads(target_manifest.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data["patch_number"] = number
                data["patch_file"] = mpq_target.name
                data["patch_size_bytes"] = mpq_target.stat().st_size
                data["patch_sha256"] = patch_sha256
                target_manifest.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
                )
        except (OSError, json.JSONDecodeError) as e:
            print(f"[警告] 批次 {batch_dir.name} manifest 回写发布信息失败：{e}")

    try:
        shutil.rmtree(batch_dir)
    except OSError as e:
        print(f"[警告] 发布成功但清理构建目录失败（可稍后用 workspace 清理移除）：{e}")

    return mpq_target


def _max_published_number(dist_dir: Path) -> int:
    """扫描 dist 现有 patch-zhCN-N.mpq 的最大序号（无则 0）。"""
    best = 0
    if not dist_dir.exists():
        return best
    for mpq in dist_dir.glob("*/patch-zhCN-*.mpq"):
        m = re.search(r"patch-zhCN-(\d+)\.mpq$", mpq.name)
        if m:
            best = max(best, int(m.group(1)))
    return best


def publish_patches(
    start_number: int = DEFAULT_START_NUMBER,
    dry_run: bool = False,
) -> dict[str, Any]:
    """发布 MPQ 补丁到分发目录。

    Args:
        start_number: 补丁编号起始值下限；实际从 max(start_number,
            dist 现有最大序号 + 1) 起编，确保新补丁序号始终大于已发布补丁。
        dry_run: 为 True 时只预览，不执行发布。

    Returns:
        包含 published, skipped, next_number 的字典。
    """
    start_number = max(start_number, _max_published_number(DIST_DIR) + 1)
    batches = collect_source_batches()
    if not batches:
        print("workspace/mpq/ 中没有可发布的批次。")
        return {
            "published": [],
            "skipped": [],
            "next_number": start_number,
        }

    published: list[tuple[str, Path]] = []
    skipped: list[str] = []
    next_number = start_number

    for batch_dir in batches:
        if is_batch_published(batch_dir, DIST_DIR):
            skipped.append(batch_dir.name)
            continue

        target_dir = DIST_DIR / batch_dir.name
        mpq_target = target_dir / f"patch-zhCN-{next_number}.mpq"

        if dry_run:
            print(f"[干跑] 将发布: {batch_dir.name} -> {mpq_target}")
            next_number += 1
            continue

        mpq_target = publish_batch(batch_dir, DIST_DIR, next_number)
        published.append((batch_dir.name, mpq_target))
        print(f"已发布: {batch_dir.name} -> {mpq_target.relative_to(settings.project_root)}")
        next_number += 1

    if skipped:
        print(f"\n已跳过（已发布）: {', '.join(skipped)}")

    pushed: list[str] = []
    push_failed: list[str] = []
    if dry_run:
        print("\n干跑完成，未执行任何发布。")
    else:
        print(f"\n共发布 {len(published)} 个批次。")
        if published and is_distro_configured():
            print("\n推送到分发端（acore-patch-distro）...")
            for name, mpq_path in published:
                try:
                    result = push_batch(mpq_path.parent)
                    pushed.append(name)
                    print(f"  已推送 {name}（补丁 #{result['patch_number']}）")
                except DistroPushError as e:
                    push_failed.append(name)
                    print(f"  [警告] 推送 {name} 失败（不影响本地发布，可稍后 distro-push 重试）：{e}")

    return {
        "published": [{"batch": name, "path": str(path)} for name, path in published],
        "skipped": skipped,
        "next_number": next_number,
        "distro_pushed": pushed,
        "distro_push_failed": push_failed,
    }
