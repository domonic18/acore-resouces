"""MPQ 档案只读查看服务。

对 workspace/mpq/{batch}/ 与 workspace/dist/{batch}/ 下的补丁 MPQ 档案
提供只读浏览：档案列表、文件清单（三级来源回退）、档案元信息、单文件
提取（带缓存）与按扩展名的内容分发。不提供任何写操作——MPQ 产物一律
经补丁构建 / 发布流程生成。

清单三级来源：① 同批次 manifest.json（构建时持久化，含 size/sha256/kind）
→ ② workspace/mpq/{batch}/listfile.txt 外部清单（经 mpqcli list -l）
→ ③ mpqcli list（依赖档案内 (listfile)，仅 none 混淆有效）。三级全部
落空时抛「无法枚举」而非返回空列表——basic 混淆档案剥除 (listfile) 后
哈希表只存哈希，无法还原文件名；按显式路径 extract 不受混淆影响。
"""

from __future__ import annotations

import hashlib
import json
import logging
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.path_display import display_path

logger = logging.getLogger(__name__)

MPQCLI = settings.project_root / "tools" / "wow-mpq-cli" / "build" / "bin" / "mpqcli"
MPQ_OUTPUT_DIR = settings.project_root / "workspace" / "mpq"
DIST_DIR = settings.project_root / "workspace" / "dist"
MPQ_CACHE_DIR = settings.project_root / "workspace" / "assets" / "mpq-cache"

# 档案根目录白名单：archive 参数以首段（mpq / dist）选择根，防目录穿越。
ARCHIVE_ROOTS: dict[str, Path] = {"mpq": MPQ_OUTPUT_DIR, "dist": DIST_DIR}

MPQCLI_TIMEOUT = 30
TEXT_PREVIEW_LIMIT = 512 * 1024
SEARCH_LIMIT = 200
TEXT_SUFFIXES = {".txt", ".lua", ".toc", ".md", ".xml", ".csv", ".ini", ".json"}


class MpqArchiveNotFoundError(FileNotFoundError):
    """档案不存在或不在允许的根目录内。"""


class MpqFileNotFoundError(FileNotFoundError):
    """档案内路径不存在。"""


class MpqInvalidPathError(ValueError):
    """档案内路径非法（含 .. / 绝对路径 / 空段）。"""


class MpqInspectionError(ValueError):
    """mpqcli 执行失败、超时或混淆档案无法枚举。"""


def _project_rel(path: Path) -> str | None:
    """返回相对 project_root 的 POSIX 路径，越界（如测试临时目录）返回 None。"""
    try:
        return path.resolve().relative_to(settings.project_root.resolve()).as_posix()
    except ValueError:
        return None


def _run_mpqcli(args: list[str]) -> subprocess.CompletedProcess[str]:
    """执行 mpqcli 并捕获输出（超时保护），返回 CompletedProcess。"""
    try:
        return subprocess.run(  # noqa: S603 - 固定二进制路径 + 参数化列表
            [str(MPQCLI), *args],
            capture_output=True,
            text=True,
            timeout=MPQCLI_TIMEOUT,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        raise MpqInspectionError(f"mpqcli 执行失败：{exc}") from exc


def _check_proc(proc: subprocess.CompletedProcess[str], what: str) -> None:
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()[-300:]
        raise MpqInspectionError(f"mpqcli 处理 {what} 失败（exit {proc.returncode}）：{stderr}")


def _resolve_archive(rel: str) -> Path:
    """解析 archive 参数（workspace 相对路径，如 mpq/{batch}/{name}.mpq）。"""
    norm = rel.replace("\\", "/").strip("/")
    parts = norm.split("/") if norm else []
    if len(parts) < 3:
        raise MpqArchiveNotFoundError(f"MPQ 档案不存在：{rel}")
    root = ARCHIVE_ROOTS.get(parts[0])
    if root is None:
        raise MpqArchiveNotFoundError(f"未知的档案来源目录：{parts[0]!r}")
    candidate = (root.joinpath(*parts[1:])).resolve()
    if candidate.suffix.lower() != ".mpq" or not candidate.is_file():
        raise MpqArchiveNotFoundError(f"MPQ 档案不存在：{rel}")
    try:
        candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise MpqArchiveNotFoundError(f"档案不在允许的目录内：{rel}") from exc
    return candidate


def _validate_inner_path(path: str) -> str:
    """校验归档内路径：反斜杠归一、拒绝空段与 ..。"""
    if path.startswith(("/", "\\")):
        raise MpqInvalidPathError(f"非法档案内路径：{path!r}")
    norm = path.replace("\\", "/").strip("/")
    if not norm or len(norm) > 500:
        raise MpqInvalidPathError(f"非法档案内路径：{path!r}")
    for seg in norm.split("/"):
        if seg in ("", ".", ".."):
            raise MpqInvalidPathError(f"非法档案内路径：{path!r}")
    return norm


def _load_manifest(batch: str) -> dict[str, Any] | None:
    """读取批次 manifest.json（dist 批次回 workspace/mpq/{batch} 查找）。"""
    path = MPQ_OUTPUT_DIR / batch / "manifest.json"
    if not path.is_file():
        return None
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return manifest if isinstance(manifest, dict) else None


def list_archives() -> dict[str, Any]:
    """列出 workspace/mpq 与 workspace/dist 下全部 MPQ 档案（含混淆等级）。

    Returns:
        {"total", "items": [{"name", "batch", "source", "rel_path", "abs_path",
        "size", "mtime", "obfuscation", "file_count", "has_manifest",
        "published"}]}，按 mtime 降序。
    """
    items: list[dict[str, Any]] = []
    for key, root in ARCHIVE_ROOTS.items():
        if not root.is_dir():
            continue
        for mpq in root.glob("*/*.mpq"):
            if key == "dist" and not mpq.name.startswith("patch-"):
                continue
            batch = mpq.parent.name
            manifest = _load_manifest(batch)
            stat = mpq.stat()
            items.append(
                {
                    "name": mpq.name,
                    "batch": batch,
                    "source": key,
                    "rel_path": f"{key}/{batch}/{mpq.name}",
                    "abs_path": display_path(mpq),
                    "size": stat.st_size,
                    "mtime": datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                    "obfuscation": manifest.get("obfuscation") if manifest else None,
                    "file_count": len(manifest.get("files", [])) if manifest else None,
                    "has_manifest": manifest is not None,
                    "published": key == "dist",
                }
            )
    items.sort(key=lambda item: item["mtime"], reverse=True)
    return {"total": len(items), "items": items}


def _normalize_list_lines(stdout: str) -> list[str]:
    """mpqcli list 行归一：去空白、反斜杠转正斜杠、去空行。"""
    return [norm for line in stdout.splitlines() if (norm := line.strip().replace("\\", "/"))]


def _list_paths(archive: Path, batch: str) -> tuple[list[dict[str, Any]], str]:
    """三级来源解析文件清单，全部落空时抛「无法枚举」。"""
    manifest = _load_manifest(batch)
    if manifest and manifest.get("files"):
        return manifest["files"], "manifest"

    listfile = MPQ_OUTPUT_DIR / batch / "listfile.txt"
    if listfile.is_file():
        proc = _run_mpqcli(["list", str(archive), "-l", str(listfile)])
        _check_proc(proc, archive.name)
        paths = _normalize_list_lines(proc.stdout)
        if paths:
            return [{"path": p} for p in paths], "listfile"

    proc = _run_mpqcli(["list", str(archive)])
    _check_proc(proc, archive.name)
    paths = _normalize_list_lines(proc.stdout)
    if paths:
        return [{"path": p} for p in paths], "mpq"

    raise MpqInspectionError("无法枚举档案内容（混淆档案缺少构建清单），请重新构建批次")


def _children(files: list[dict[str, Any]], prefix: str) -> list[dict[str, Any]]:
    """从扁平路径清单聚合 prefix 下的一级子项（目录在前，不区分大小写排序）。"""
    prefix_slash = f"{prefix}/" if prefix else ""
    children: dict[str, dict[str, Any]] = {}
    for entry in files:
        path = entry["path"]
        if prefix_slash and not path.startswith(prefix_slash):
            continue
        rest = path[len(prefix_slash) :] if prefix_slash else path
        if not rest:
            continue
        seg, _, tail = rest.partition("/")
        if tail:
            node = children.setdefault(
                seg, {"name": seg, "path": f"{prefix_slash}{seg}", "type": "dir", "file_count": 0}
            )
            node["file_count"] += 1
        else:
            children[seg] = {
                "name": seg,
                "path": path,
                "type": "file",
                "size": entry.get("size_bytes"),
                "kind": entry.get("kind"),
            }
    return sorted(children.values(), key=lambda c: (c["type"] != "dir", c["name"].lower()))


def get_archive_info(archive_rel: str) -> dict[str, str]:
    """mpqcli info 输出解析为键值 dict（键小写、空格转连字符）。"""
    archive = _resolve_archive(archive_rel)
    proc = _run_mpqcli(["info", str(archive)])
    _check_proc(proc, archive.name)
    info: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        key, sep, value = line.partition(":")
        if sep:
            info[key.strip().lower().replace(" ", "-")] = value.strip()
    return info


def list_files(archive_rel: str, *, prefix: str = "", search: str | None = None) -> dict[str, Any]:
    """列出档案内容：prefix 一级子项（懒加载层级树）或 search 扁平匹配。

    Returns:
        {"archive", "rel_path", "source", "obfuscation", "total_files",
        "prefix"?, "entries": [{"name", "path", "type", "size?", "kind?",
        "file_count"?}], "archive_info"?}。

    Raises:
        MpqArchiveNotFoundError: 档案不存在。
        MpqInspectionError: mpqcli 失败或混淆档案无法枚举。
    """
    archive = _resolve_archive(archive_rel)
    batch = archive.parent.name
    files, source = _list_paths(archive, batch)
    manifest = _load_manifest(batch)

    result: dict[str, Any] = {
        "archive": archive.name,
        "rel_path": archive_rel,
        "source": source,
        "obfuscation": manifest.get("obfuscation") if manifest else None,
        "total_files": len(files),
    }
    try:
        result["archive_info"] = get_archive_info(archive_rel)
    except MpqInspectionError:
        logger.warning("mpqcli info 失败，省略档案元信息：%s", archive_rel)

    if search:
        query = search.lower()
        matched = [f for f in files if query in f["path"].lower()]
        result["entries"] = [
            {
                "name": f["path"].rsplit("/", 1)[-1],
                "path": f["path"],
                "type": "file",
                "size": f.get("size_bytes"),
                "kind": f.get("kind"),
            }
            for f in matched[:SEARCH_LIMIT]
        ]
        result["truncated"] = len(matched) > SEARCH_LIMIT
        return result

    norm_prefix = _validate_inner_path(prefix) if prefix else ""
    result["prefix"] = norm_prefix
    result["entries"] = _children(files, norm_prefix)
    return result


def _cache_dir(archive: Path) -> Path:
    """提取缓存目录：workspace/assets/mpq-cache/{hash}（档案重建即失效）。"""
    stat = archive.stat()
    rel = _project_rel(archive) or archive.name
    digest = hashlib.sha256(f"{rel}:{stat.st_mtime_ns}:{stat.st_size}".encode()).hexdigest()[:16]
    return MPQ_CACHE_DIR / digest


def extract_file(archive_rel: str, inner_path: str) -> Path:
    """提取单个文件到缓存目录（命中跳过 mpqcli），返回本地路径。

    Raises:
        MpqArchiveNotFoundError / MpqInvalidPathError: 参数问题。
        MpqFileNotFoundError: 路径不存在于档案中。
        MpqInspectionError: mpqcli 失败。
    """
    archive = _resolve_archive(archive_rel)
    inner = _validate_inner_path(inner_path)
    cache_root = _cache_dir(archive)
    target = cache_root.joinpath(*inner.split("/"))
    if target.is_file() and target.stat().st_size > 0:
        return target

    cache_root.mkdir(parents=True, exist_ok=True)
    # StormLib 按反斜杠分隔符计算路径哈希，extract 需用档案内原生分隔符
    proc = _run_mpqcli(
        ["extract", str(archive), "-f", inner.replace("/", "\\"), "-o", str(cache_root), "-k"]
    )
    _check_proc(proc, f"{archive.name}:{inner}")
    if not target.is_file():
        raise MpqFileNotFoundError(f"路径不存在于档案中：{inner}")
    logger.info("MPQ 提取：%s → %s", inner, target)
    return target


def read_file_preview(archive_rel: str, inner_path: str) -> dict[str, Any]:
    """提取文件并按扩展名分发：text / blp / dbc / binary。

    blp / binary 的前端展示与下载经 /api/preview/blp|file + cache_path
    （project_root 相对路径）复用现有预览链路，此处不返回内容本体。
    """
    inner = _validate_inner_path(inner_path)
    target = extract_file(archive_rel, inner)
    stat = target.stat()
    cache_rel = _project_rel(target)
    suffix = Path(inner).suffix.lower()

    result: dict[str, Any] = {
        "kind": "binary",
        "path": inner,
        "size": stat.st_size,
        "cache_path": cache_rel,
        # 提取件在测试临时目录（project_root 外）时为 None
        "cache_abs_path": display_path(target) if cache_rel else None,
    }
    if suffix in TEXT_SUFFIXES and stat.st_size <= TEXT_PREVIEW_LIMIT:
        data = target.read_bytes()
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            content = data.decode("latin-1")
        result["kind"] = "text"
        result["content"] = content
    elif suffix == ".blp":
        result["kind"] = "blp"
    elif suffix == ".dbc":
        result["kind"] = "dbc"
    return result
