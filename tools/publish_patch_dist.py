#!/usr/bin/env python3
"""发布 MPQ 补丁到分发目录。

扫描 workspace/mpq/ 下的批次构建结果，将每个未发布的批次复制到
workspace/dist/{timestamp}/ 下，并将 MPQ 文件重命名为魔兽世界客户端
补丁命名方式 patch-zhCN-{number}.mpq。

只发布 .mpq 和 readme.txt；staging/ 等中间产物不会复制。
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path("/Users/deadwalk/Code/acore-resouces")
MPQ_DIR = ROOT / "workspace" / "mpq"
DIST_DIR = ROOT / "workspace" / "dist"
PATCH_NAME_PATTERN = re.compile(r"^patch-zhCN-(\d+)\.mpq$", re.IGNORECASE)
DEFAULT_START_NUMBER = 5


def find_next_patch_number(dist_dir: Path, start_number: int) -> int:
    """扫描已发布的 patch-zhCN-*.mpq，返回下一个可用编号。"""
    max_number = 0
    if not dist_dir.exists():
        return start_number

    for mpq_file in dist_dir.rglob("patch-zhCN-*.mpq"):
        match = PATCH_NAME_PATTERN.match(mpq_file.name)
        if match:
            max_number = max(max_number, int(match.group(1)))

    return max_number + 1 if max_number >= start_number else start_number


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


def publish_batch(batch_dir: Path, dist_dir: Path, number: int) -> Path:
    """发布单个批次到分发目录，返回发布后的 MPQ 路径。"""
    target_dir = dist_dir / batch_dir.name
    target_dir.mkdir(parents=True, exist_ok=True)

    mpq_sources = list(batch_dir.glob("patch-*.mpq"))
    if not mpq_sources:
        raise FileNotFoundError(f"批次 {batch_dir.name} 中没有找到 MPQ 文件")

    # 每个批次理论上只有一个 patch-*.mpq
    mpq_source = mpq_sources[0]
    mpq_target = target_dir / f"patch-zhCN-{number}.mpq"
    shutil.copy2(mpq_source, mpq_target)

    readme_source = batch_dir / "readme.txt"
    readme_target = target_dir / "readme.txt"
    if readme_source.exists():
        shutil.copy2(readme_source, readme_target)

    return mpq_target


def main() -> int:
    """CLI entrypoint."""
    parser = argparse.ArgumentParser(description="发布 MPQ 补丁到分发目录")
    parser.add_argument(
        "--start-number",
        type=int,
        default=DEFAULT_START_NUMBER,
        help=f"补丁编号起始值（默认 {DEFAULT_START_NUMBER}）",
    )
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不执行复制")
    args = parser.parse_args()

    start_number = args.start_number
    batches = collect_source_batches()
    if not batches:
        print("workspace/mpq/ 中没有可发布的批次。")
        return 0

    next_number = find_next_patch_number(DIST_DIR, start_number)
    published: list[tuple[str, Path]] = []
    skipped: list[str] = []

    for batch_dir in batches:
        if is_batch_published(batch_dir, DIST_DIR):
            skipped.append(batch_dir.name)
            continue

        if args.dry_run:
            target_dir = DIST_DIR / batch_dir.name
            mpq_target = target_dir / f"patch-zhCN-{next_number}.mpq"
            print(f"[干跑] 将发布: {batch_dir.name} -> {mpq_target}")
            next_number += 1
            continue

        mpq_target = publish_batch(batch_dir, DIST_DIR, next_number)
        published.append((batch_dir.name, mpq_target))
        print(f"已发布: {batch_dir.name} -> {mpq_target.relative_to(ROOT)}")
        next_number += 1

    if skipped:
        print(f"\n已跳过（已发布）: {', '.join(skipped)}")

    if args.dry_run:
        print("\n干跑完成，未执行任何复制。")
    else:
        print(f"\n共发布 {len(published)} 个批次。")

    return 0


if __name__ == "__main__":
    sys.exit(main())
