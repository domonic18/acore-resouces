"""MPQ 档案混淆服务。

basic 混淆 = 永久剥除档案内 (listfile) 与 (attributes) 两个内部文件：
客户端按路径哈希定位文件，加载不受影响；第三方工具无法再枚举内容
（哈希表只存哈希，档案名不可还原）。按显式路径提取不受影响。
混淆不可逆，对已混淆档案重复操作被拒绝。

两条入口：

- obfuscate_mpq_file(mpq_path)：低层操作 + 路径泄漏校验，供构建流水线在
  create 后直接产出混淆补丁（构建向导选择 basic 混淆时走这里）。
- obfuscate_archive(rel)：面向 MPQ 查看页的档案级操作，带 manifest
  状态守卫与回写。dist 已上架档案拒绝混淆——发布是移动语义，构建侧
  批次已清空，dist 里的 MPQ 是唯一产物，无法原地补混淆；正确路径是
  重建勾选混淆 → 发布新补丁 → 下架旧批次。
"""

from __future__ import annotations

import json
import logging
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.services import mpq_inspector

logger = logging.getLogger(__name__)

# 混淆会重写整个档案（紧凑 + 重建哈希表），大档案耗时高于只读查看
OBFUSCATION_TIMEOUT = 120


class MpqObfuscationError(ValueError):
    """档案不满足混淆前置条件，或混淆/校验失败。"""


def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
    """执行 mpqcli 并捕获输出，超时/启动失败统一转 MpqObfuscationError。"""
    try:
        return subprocess.run(  # noqa: S603 - 固定二进制路径 + 参数化列表
            [str(mpq_inspector.MPQCLI), *args],
            capture_output=True,
            text=True,
            timeout=OBFUSCATION_TIMEOUT,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        raise MpqObfuscationError(f"mpqcli 执行失败：{exc}") from exc


def _verify_obfuscated(mpq_path: Path) -> None:
    """校验混淆生效：mpqcli list 不得枚举出任何真实路径。

    混淆档案的内部 (listfile) 已剥除，mpqcli list 仍会退出 0，输出的是
    StormLib 枚举占位名（File00000000.xxx）——因此不能以退出码判定，必须
    检查输出中是否泄漏路径分隔符。
    """
    proc = _run(["list", str(mpq_path)])
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()[-300:]
        raise MpqObfuscationError(f"混淆后校验失败（exit {proc.returncode}）：{stderr}")
    leaked = [
        line.strip()
        for line in proc.stdout.splitlines()
        if line.strip() and ("/" in line or "\\" in line)
    ]
    if leaked:
        sample = "、".join(leaked[:3])
        raise MpqObfuscationError(f"混淆后校验失败：档案仍可枚举真实路径（如 {sample}）")


def obfuscate_mpq_file(mpq_path: Path) -> None:
    """对单个 MPQ 文件执行混淆并校验（无 manifest 守卫，构建流水线用）。"""
    proc = _run(["obfuscate", str(mpq_path)])
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()[-300:]
        raise MpqObfuscationError(f"mpqcli obfuscate 失败（exit {proc.returncode}）：{detail}")
    _verify_obfuscated(mpq_path)


def obfuscate_archive(rel: str) -> dict[str, Any]:
    """混淆 workspace/mpq 下的一个批次档案，回写 manifest 混淆状态。

    Args:
        rel: 档案工作区相对路径（如 mpq/{batch}/patch-mounts.mpq）。

    Returns:
        {"rel_path", "obfuscation", "obfuscated_at"}

    Raises:
        MpqObfuscationError: dist 档案、缺 manifest、已混淆或 mpqcli 失败。
        mpq_inspector.MpqArchiveNotFoundError: 档案不存在或越界。
    """
    path = mpq_inspector._resolve_archive(rel)
    source = rel.replace("\\", "/").strip("/").split("/")[0]
    if source == "dist":
        # 发布是移动语义：上架后构建侧批次已清空，dist 里的 MPQ 是唯一产物，
        # 补做混淆没有对象。正确路径是重建勾选混淆 → 发布新补丁 → 下架旧批次。
        raise MpqObfuscationError(
            "已上架的补丁产物不能直接混淆（发布后构建侧档案已移走）："
            "请重新构建该批次并在构建时勾选混淆，发布新补丁后再下架旧批次"
        )

    manifest_path = path.parent / "manifest.json"
    if not manifest_path.is_file():
        raise MpqObfuscationError("该档案缺少 manifest.json，无法安全混淆；请重新构建补丁")
    try:
        manifest: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise MpqObfuscationError(f"manifest.json 损坏，无法安全混淆：{exc}") from exc
    if manifest.get("obfuscation") == "basic":
        raise MpqObfuscationError("该档案已是混淆状态，无需重复混淆")

    obfuscate_mpq_file(path)

    now = datetime.now(UTC).isoformat()
    manifest["obfuscation"] = "basic"
    manifest["obfuscated_at"] = now
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    logger.info("MPQ 档案已混淆：%s", rel)
    return {"rel_path": rel, "obfuscation": "basic", "obfuscated_at": now}
