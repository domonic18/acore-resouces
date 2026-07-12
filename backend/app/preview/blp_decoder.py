"""BLP 贴图解码服务。

使用 Pillow 直接读取 Blizzard 的 `.blp` 格式并输出为 WebP。
Pillow 从较新版本开始已内置 BLP 读取支持，因此本模块无需额外依赖。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image


def decode_blp_to_image(input_path: Path) -> Image.Image:
    """将 .blp 文件解码为 Pillow Image 对象。

    Args:
        input_path: 原始 .blp 文件路径。

    Returns:
        RGB 或 RGBA 模式的 Pillow Image。

    Raises:
        FileNotFoundError: 输入文件不存在。
        ValueError: 解码失败或格式不支持。
    """
    if not input_path.exists():
        raise FileNotFoundError(f"BLP 文件不存在：{input_path}")

    try:
        with Image.open(input_path) as image:
            if image.mode in ("RGBA", "P"):
                return image.convert("RGBA")
            return image.convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"无法解码 BLP 文件 {input_path}: {exc}") from exc


def save_image_as_webp(
    image: Image.Image,
    output_path: Path,
    *,
    quality: int = 85,
    max_size: tuple[int, int] | None = None,
) -> None:
    """将 Pillow Image 保存为 WebP。

    Args:
        image: Pillow Image 对象。
        output_path: 输出 WebP 路径。
        quality: WebP 质量，默认 85。
        max_size: 若指定，先将图像缩放到不超过该尺寸。
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if max_size is not None:
        image.thumbnail(max_size)

    save_kwargs: dict[str, Any] = {"quality": quality, "method": 4}
    if image.mode == "RGBA":
        save_kwargs["lossless"] = False

    image.save(output_path, "WEBP", **save_kwargs)


def decode_blp_to_webp(
    input_path: Path,
    output_path: Path,
    *,
    max_size: tuple[int, int] | None = None,
    quality: int = 85,
) -> Path:
    """将 .blp 文件解码并保存为 WebP。

    Args:
        input_path: 原始 .blp 文件路径。
        output_path: 输出 WebP 路径。
        max_size: 若指定，生成缩略图尺寸。
        quality: WebP 质量。

    Returns:
        输出文件路径。
    """
    image = decode_blp_to_image(input_path)
    save_image_as_webp(image, output_path, max_size=max_size, quality=quality)
    return output_path
