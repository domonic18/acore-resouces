"""图标基础设施打包。

客户端解析图标依赖两张表：法术图标查 ``SpellIcon.dbc``（SpellIconID → 贴图名），
物品图标查 ``ItemDisplayInfo.dbc``（item_template.displayid → InventoryIcon）。
这两张表此前从不随补丁分发，客户端只能依赖自己安装的图标包解析超出 3.3.5
原生范围的行号；图标包缺失时整条图标链静默失效——2026-11-23 的「坐骑物品
问号 / 法术无图标」事故即源于此。

本模块在每个补丁 MPQ 中写入：
1. 全量 ``DBFilesClient/SpellIcon.dbc`` 与 ``DBFilesClient/ItemDisplayInfo.dbc``
   （本地 wow-dbc 已是 3.3.5 格式的扩展表）；
2. 全部坐骑 YAML（``dbc.spell.icon_id`` / ``dbc.item.display_id`` /
   ``db.item_template.displayid``）引用到的图标贴图 ``Interface/icons/*.blp``。

注意 DBC 在 MPQ 里是整文件覆盖（编号高的补丁胜出），因此两个补丁都带全量表
是幂等且安全的；图标贴图只带被引用的，全量图标库（2.5 万个 .blp）不进补丁。
"""

from __future__ import annotations

import shutil
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.preview.icon_index import find_icon_path
from app.schemas.resource import Mount
from app.services.dbc_query import load_item_display_icons, load_spell_icon_names

WOW_DBC_DIR = settings.wow_dbc_dir

# 图标基础设施 DBC：客户端解析图标链的必备表，每个补丁都随包分发。
ICON_INFRA_DBC_FILES = ("SpellIcon.dbc", "ItemDisplayInfo.dbc")

# 贴图在 MPQ 内的固定目录（客户端按 Interface\Icons\<名>.blp 解析）。
MPQ_ICON_DIR = Path("Interface") / "icons"
MPQ_DBC_DIR = Path("DBFilesClient")


@dataclass
class ReferencedIcons:
    """坐骑资源引用到的图标收集结果。

    Attributes:
        icon_names: 引用到的图标名集合（去路径前缀、小写）。
        missing: 解析失败条目，``{"source": 描述, "ref_id": 行号, "reason": 原因}``。
    """

    icon_names: set[str] = field(default_factory=set)
    missing: list[dict[str, Any]] = field(default_factory=list)


def collect_referenced_icon_names(
    mounts: Sequence[Mount],
    spell_icon_names: dict[int, str] | None = None,
    item_display_icons: dict[int, str] | None = None,
) -> ReferencedIcons:
    """收集全部坐骑 YAML 引用到的图标名。

    引用来源（YAML 为真相源）：
    - ``dbc.spell.icon_id`` → SpellIcon.dbc 行号；
    - ``dbc.item.display_id`` / ``db.item_template.displayid`` → ItemDisplayInfo.dbc
      行号（两处填同一值，任一非零都收）。

    Args:
        mounts: 坐骑资源列表。
        spell_icon_names: SpellIcon 行号 → 图标名；缺省时从本地 DBC 加载。
        item_display_icons: ItemDisplayInfo 行号 → 图标名；缺省时从本地 DBC 加载。

    Returns:
        引用到的图标名集合与解析失败清单。
    """
    if spell_icon_names is None:
        spell_icon_names = load_spell_icon_names()
    if item_display_icons is None:
        item_display_icons = load_item_display_icons()

    result = ReferencedIcons()
    for mount in mounts:
        spell = mount.dbc.spell
        icon_id = int(spell.icon_id or 0)
        if icon_id:
            name = spell_icon_names.get(icon_id)
            if name:
                result.icon_names.add(name)
            else:
                result.missing.append(
                    {
                        "source": f"mount_{mount.id:04d} spell.icon_id",
                        "ref_id": icon_id,
                        "reason": "SpellIcon.dbc 中不存在该行",
                    }
                )

        display_id = int(mount.dbc.item.display_id or 0)
        item_template = mount.db.item_template
        if not display_id and item_template is not None:
            display_id = int(getattr(item_template, "displayid", 0) or 0)
        if display_id:
            icon = item_display_icons.get(display_id)
            if icon:
                result.icon_names.add(_normalize_icon_name(icon))
            else:
                result.missing.append(
                    {
                        "source": f"mount_{mount.id:04d} display_id",
                        "ref_id": display_id,
                        "reason": "ItemDisplayInfo.dbc 中不存在该行",
                    }
                )
    return result


def stage_icon_infrastructure(
    staging: Path,
    mounts: Sequence[Mount],
    dbc_dir: Path | None = None,
    icon_lookup: Callable[[str | None], Path | None] = find_icon_path,
    spell_icon_names: dict[int, str] | None = None,
    item_display_icons: dict[int, str] | None = None,
) -> dict[str, Any]:
    """把图标表与被引用的图标贴图写入 MPQ staging。

    Args:
        staging: MPQ staging 根目录。
        mounts: 坐骑资源列表（用于确定要携带哪些图标贴图）。
        dbc_dir: 源 DBC 目录；缺省用 data/wow-dbc/src/dbc。
        icon_lookup: 图标名 → 本地 .blp 路径；缺省用图标索引。
        spell_icon_names: SpellIcon 行号 → 图标名；缺省时从本地 DBC 加载。
        item_display_icons: ItemDisplayInfo 行号 → 图标名；缺省时从本地 DBC 加载。

    Returns:
        ``{"dbc": [归档内路径], "icons": [归档内路径], "missing": [缺失清单]}``，
        供 manifest 记录。
    """
    dbc_dir = dbc_dir or WOW_DBC_DIR
    referenced = collect_referenced_icon_names(
        mounts, spell_icon_names=spell_icon_names, item_display_icons=item_display_icons
    )

    dbc_written: list[Path] = []
    dbc_target = staging / MPQ_DBC_DIR
    dbc_target.mkdir(parents=True, exist_ok=True)
    for dbc_name in ICON_INFRA_DBC_FILES:
        src = dbc_dir / dbc_name
        if not src.exists():
            referenced.missing.append(
                {"source": f"DBFilesClient/{dbc_name}", "ref_id": None, "reason": "源文件不存在"}
            )
            continue
        shutil.copy2(src, dbc_target / dbc_name)
        dbc_written.append(MPQ_DBC_DIR / dbc_name)

    icon_written: list[Path] = []
    icon_target = staging / MPQ_ICON_DIR
    icon_target.mkdir(parents=True, exist_ok=True)
    for name in sorted(referenced.icon_names):
        icon_src = icon_lookup(name)
        if icon_src is None or not icon_src.exists():
            referenced.missing.append(
                {
                    "source": f"Interface/icons/{name}.blp",
                    "ref_id": None,
                    "reason": "图标库中不存在该贴图",
                }
            )
            continue
        shutil.copy2(icon_src, icon_target / icon_src.name)
        icon_written.append(MPQ_ICON_DIR / icon_src.name)

    return {"dbc": dbc_written, "icons": icon_written, "missing": referenced.missing}


def _normalize_icon_name(name: str) -> str:
    """图标名统一为小写文件名（去路径前缀）。"""
    return name.replace("/", "\\").split("\\")[-1].lower()
