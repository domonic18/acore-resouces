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

MPQ_DIR = settings.project_root / "workspace" / "mpq"
DIST_DIR = settings.project_root / "workspace" / "dist"
DEFAULT_START_NUMBER = 5
_HASH_CHUNK = 1024 * 1024


def _digest_file(path: Path) -> tuple[str, str]:
    """一次遍历同时计算 (sha256, md5)。"""
    sha = hashlib.sha256()
    md5 = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(_HASH_CHUNK), b""):
            sha.update(chunk)
            md5.update(chunk)
    return sha.hexdigest(), md5.hexdigest()


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
    patch_sha256, patch_md5 = _digest_file(mpq_source)
    shutil.move(str(mpq_source), str(mpq_target))

    # 回写发布信息到 dist 侧 manifest：序号/文件名/大小/校验和，
    # 供 MPQ 查看器与玩家下载页直接消费
    target_manifest = target_dir / "manifest.json"
    if target_manifest.is_file():
        try:
            data = json.loads(target_manifest.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                data["patch_number"] = number
                data["patch_file"] = mpq_target.name
                data["patch_size_bytes"] = mpq_target.stat().st_size
                data["patch_sha256"] = patch_sha256
                data["patch_md5"] = patch_md5
                target_manifest.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
                )
        except (OSError, json.JSONDecodeError) as e:
            print(f"[警告] 批次 {batch_dir.name} manifest 回写发布信息失败：{e}")

    # 批次目录马上要被清掉，先把任务清单读出来
    batch_job_ids = _read_batch_job_ids(batch_dir / "manifest.json")

    try:
        shutil.rmtree(batch_dir)
    except OSError as e:
        print(f"[警告] 发布成功但清理构建目录失败（可稍后用 workspace 清理移除）：{e}")

    _mark_batch_jobs_applied(
        batch_name=batch_dir.name,
        job_ids=batch_job_ids,
        mpq_target=mpq_target,
    )
    return mpq_target


def _read_batch_job_ids(manifest_path: Path) -> list[str]:
    """从批次 manifest 中读出该批次包含的任务 ID。"""
    if not manifest_path.is_file():
        return []
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    jobs = data.get("jobs") if isinstance(data, dict) else None
    if not isinstance(jobs, list):
        return []
    return [str(job_id) for job_id in jobs]


def _mark_batch_jobs_applied(
    batch_name: str,
    job_ids: list[str],
    mpq_target: Path | None = None,
) -> None:
    """把该批次内的补丁任务标记为 applied，并更新产物路径登记。

    没有这一步，任务的 status 永远停在 generated，界面无法区分
    「构建完成」与「已经发布上线」。

    还要更新 artifacts.output.mpq：发布是**移动**语义，MPQ 从
    workspace/mpq/<批次>/patch-mounts.mpq 变成
    workspace/dist/<批次>/patch-zhCN-<N>.mpq，登记不更新的话
    产物清单里的链接会指向一个已不存在的路径。
    """
    if not job_ids:
        return
    from app.services.patch_exporter import get_patch_job, update_patch_job_status

    new_mpq = str(mpq_target.relative_to(settings.project_root)) if mpq_target is not None else None

    for job_id in job_ids:
        try:
            if new_mpq:
                manifest = get_patch_job(job_id)
                if manifest is not None:
                    output = dict(manifest.artifacts.output)
                    output["mpq"] = new_mpq
                    update_patch_job_status(
                        job_id,
                        "applied",
                        summary=f"已发布批次 {batch_name}",
                        output_artifacts=output,
                    )
                    continue
            update_patch_job_status(job_id, "applied", summary=f"已发布批次 {batch_name}")
        except Exception as e:  # noqa: BLE001 - 标记失败不应影响发布结果
            print(f"[警告] 任务 {job_id} 标记为 applied 失败：{e}")


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
    batch_ids: list[str] | None = None,
) -> dict[str, Any]:
    """发布 MPQ 补丁到分发目录。

    Args:
        start_number: 补丁编号起始值下限；实际从 max(start_number,
            dist 现有最大序号 + 1) 起编，确保新补丁序号始终大于已发布补丁。
        dry_run: 为 True 时只预览，不执行发布。
        batch_ids: 指定要发布的批次；为 None 时发布所有未发布批次。

    Returns:
        包含 published, skipped, next_number 的字典。
    """
    start_number = max(start_number, _max_published_number(DIST_DIR) + 1)
    batches = collect_source_batches()
    if batch_ids:
        wanted = set(batch_ids)
        batches = [b for b in batches if b.name in wanted]
    if not batches:
        print("workspace/mpq/ 中没有可发布的批次。")
        return {
            "published": [],
            "skipped": [],
            # 字段集必须与正常路径一致——前端按固定形状读取，缺字段会崩
            "preview": [],
            "next_number": start_number,
        }

    published: list[tuple[str, Path]] = []
    skipped: list[str] = []
    preview: list[dict[str, Any]] = []
    next_number = start_number

    for batch_dir in batches:
        if is_batch_published(batch_dir, DIST_DIR):
            skipped.append(batch_dir.name)
            continue

        target_dir = DIST_DIR / batch_dir.name
        mpq_target = target_dir / f"patch-zhCN-{next_number}.mpq"

        if dry_run:
            # 干跑也要如实回报「将要发布什么」——否则前端只能显示
            # 「没有找到可发布的批次」，把预览误报成失败。
            preview.append(
                {
                    "batch": batch_dir.name,
                    "path": str(mpq_target.relative_to(settings.project_root)),
                    "patch_number": next_number,
                }
            )
            print(f"[干跑] 将发布: {batch_dir.name} -> {mpq_target}")
            next_number += 1
            continue

        mpq_target = publish_batch(batch_dir, DIST_DIR, next_number)
        published.append((batch_dir.name, mpq_target))
        preview.append(
            {
                "batch": batch_dir.name,
                "path": str(mpq_target.relative_to(settings.project_root)),
                "patch_number": next_number,
            }
        )
        print(f"已发布: {batch_dir.name} -> {mpq_target.relative_to(settings.project_root)}")
        next_number += 1

    if skipped:
        print(f"\n已跳过（已发布）: {', '.join(skipped)}")

    if dry_run:
        print("\n干跑完成，未执行任何发布。")
    else:
        print(f"\n共发布 {len(published)} 个批次。发布即上架，玩家可在「补丁下载」页获取。")

    return {
        "published": [{"batch": name, "path": str(path)} for name, path in published],
        "skipped": skipped,
        # 干跑时列出「将要发布什么」，真实发布时与 published 一致
        "preview": preview,
        "next_number": next_number,
    }
