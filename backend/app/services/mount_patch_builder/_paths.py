"""补丁构建的路径与文件名常量。

全部由 app.core.config.settings 派生。包内各子模块不直接 import 本模块的
常量值，而是经包 facade（``app.services.mount_patch_builder``）动态读取，
保证测试通过 monkeypatch 包属性替换目录指向时行为与拆分前一致。
"""

from __future__ import annotations

from app.core.config import settings

WOW_DBC_DIR = settings.wow_dbc_dir
MPQCLI = settings.project_root / "tools" / "wow-mpq-cli" / "build" / "bin" / "mpqcli"
MPQ_OUTPUT_DIR = settings.mpq_output_dir
REPORTS_DIR = settings.reports_dir
SQL_LINK_DIR = settings.project_root / "data" / "sql" / "azerothcore-updates"
SQL_MOUNTS_DIR = SQL_LINK_DIR / settings.acore_sql_mounts_subdir

# 构建产物 MPQ 文件名：manifest / readme / 批次清单 / 审计共用同一约定。
MPQ_FILENAME = "patch-mounts.mpq"

REQUIRED_DBC_FILES = [
    "CreatureModelData.dbc",
    "CreatureDisplayInfo.dbc",
    "Spell.dbc",
    "Item.dbc",
]
