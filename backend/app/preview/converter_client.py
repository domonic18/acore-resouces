"""模型转换工具调用客户端。

负责调用 Rust `model-converter` CLI，将 `.m2` 转换为 `.gltf`/`.glb`，
并管理 `assets/gltf/{model_folder}/` 缓存。
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.preview.asset_resolver import resolve_resource_dir

DEFAULT_CONVERTER_BINARY = (
    settings.project_root
    / "tools"
    / "model-converter"
    / "target"
    / "release"
    / "model-converter"
)


def _find_main_m2(resource_type: str, model_folder: str) -> Path | None:
    resource_dir = resolve_resource_dir(resource_type, model_folder)
    if not resource_dir.exists():
        return None
    m2_files = sorted(resource_dir.rglob("*.m2"))
    if not m2_files:
        return None
    # 优先选择最简短的主模型文件
    return min(m2_files, key=lambda p: len(p.name))


def _get_gltf_output_dir(model_folder: str) -> Path:
    return settings.gltf_dir / model_folder


def is_gltf_cache_valid(resource_type: str, model_folder: str) -> bool:
    """检查 glTF 缓存是否有效（存在 manifest.json 且源 M2 未变化）。"""
    output_dir = _get_gltf_output_dir(model_folder)
    manifest_path = output_dir / "manifest.json"
    if not manifest_path.exists():
        return False

    m2_path = _find_main_m2(resource_type, model_folder)
    if not m2_path:
        return False

    m2_mtime = m2_path.stat().st_mtime
    manifest_mtime = manifest_path.stat().st_mtime
    return manifest_mtime >= m2_mtime


def convert_m2_to_gltf(
    resource_type: str,
    model_folder: str,
    *,
    converter_binary: Path | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """调用 model-converter 转换 M2 为 glTF。

    Args:
        resource_type: 资源类型。
        model_folder: 模型文件夹名。
        converter_binary: 转换器二进制路径，默认使用 release 构建产物。
        force: 是否强制重新转换。

    Returns:
        包含 status、output_dir、manifest 的字典。
    """
    m2_path = _find_main_m2(resource_type, model_folder)
    if not m2_path:
        return {
            "status": "not_found",
            "message": "未找到 .m2 文件",
            "output_dir": None,
            "manifest": None,
        }

    if not force and is_gltf_cache_valid(resource_type, model_folder):
        output_dir = _get_gltf_output_dir(model_folder)
        cached_manifest_path = output_dir / "manifest.json"
        cached_manifest = json.loads(cached_manifest_path.read_text(encoding="utf-8"))
        return {
            "status": "cached",
            "output_dir": str(output_dir),
            "manifest": cached_manifest,
        }

    binary = converter_binary or DEFAULT_CONVERTER_BINARY
    if not binary.exists():
        return {
            "status": "converter_not_built",
            "message": f"转换器未构建：{binary}，请运行 cargo build --release",
            "output_dir": None,
            "manifest": None,
        }

    output_dir = _get_gltf_output_dir(model_folder)
    resource_dir = resolve_resource_dir(resource_type, model_folder)

    cmd = [
        str(binary),
        "convert-m2",
        "--input",
        str(m2_path),
        "--output",
        str(output_dir),
        "--texture-search-path",
        str(resource_dir),
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        return {
            "status": "error",
            "message": f"无法执行转换器：{exc}",
            "output_dir": None,
            "manifest": None,
        }

    manifest_path = output_dir / "manifest.json"
    manifest: dict[str, Any] | None = None
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    if result.returncode != 0:
        return {
            "status": "error",
            "message": result.stderr or "转换器返回非零退出码",
            "output_dir": str(output_dir),
            "manifest": manifest,
        }

    return {
        "status": "converted",
        "output_dir": str(output_dir),
        "manifest": manifest,
    }
