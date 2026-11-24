"""坐骑补丁构建服务。

负责读取 workspace/patch-jobs/ 下的任务，按 job.json 中的资源 ID 现场
读取 data/resources/ 真相源 YAML，在内存中构建 DBC/SQL 计划后批量编辑
源 DBC、生成 SQL、构建 MPQ、输出校验报告并更新任务状态。

该服务被 backend/app/cli/patch.py 的 `patch build` 命令调用。
底层依赖：
- wow-dbc-tool（Python API / CLI）用于 DBC 读写。
- tools/wow-mpq-cli/build/bin/mpqcli 用于 MPQ 打包。

包结构（本 `__init__` 全量 re-export，保持拆分前的模块级公共 API 不变；
外部 `from app.services.mount_patch_builder import X` 无需任何改动）：

- `_paths`           路径与文件名常量
- `_errors`          构建错误类型
- `_logging`         构建进度日志与回调注册
- `_context`         JobContext / job 发现 / 通用 IO 助手
- `_dbc`             DBC 计划汇总、冲突检查与源 DBC 编辑（含 schema 注册副作用）
- `_sql`             坐骑 SQL 文件生成
- `_mpq`             MPQ 打包与 manifest / readme
- `_checks`          校验结果数据类与 sql-plan 查询小助手
- `_feature_checks`  载具/挂件/特性标签一致性校验
- `_validation`      单任务一致性校验（validate_job）
- `_reports`         校验报告 / 计划落盘 / 任务状态回写
- `_builder`         build_mount_patches 构建入口

注意：包内子模块读取可被测试 monkeypatch 的模块级名字（目录常量、
`_record_by_id`、`ensure_sql_symlink` 等）时统一经包 facade 动态解析，
保证对 `app.services.mount_patch_builder.<name>` 打补丁的行为与
拆分前单文件模块完全一致。
"""

from __future__ import annotations

from ._builder import build_mount_patches
from ._checks import JobValidation, ValidationResult
from ._context import (
    JobContext,
    build_job_context,
    ensure_sql_symlink,
    find_jobs,
    load_json,
    load_yaml,
    sanitize_model_folder,
    save_json,
)
from ._dbc import (
    _record_by_id,
    apply_dbc_operations,
    check_conflicts,
    collect_dbc_operations,
    find_existing_dbc_records,
    load_dbc_record_ids,
)
from ._errors import DBCConflictError, MountPatchBuilderError
from ._mpq import build_mpq
from ._paths import (
    MPQ_FILENAME,
    MPQ_OUTPUT_DIR,
    MPQCLI,
    REPORTS_DIR,
    REQUIRED_DBC_FILES,
    SQL_LINK_DIR,
    SQL_MOUNTS_DIR,
    WOW_DBC_DIR,
)
from ._reports import _clear_plans, _dump_plans, update_job_records, write_validation_report
from ._sql import (
    _build_delete_where_clause,
    _collect_existing_sql_entries,
    _job_item_entry,
    generate_sql,
)
from ._validation import validate_job

__all__ = [
    # 常量
    "MPQCLI",
    "MPQ_FILENAME",
    "MPQ_OUTPUT_DIR",
    "REQUIRED_DBC_FILES",
    "REPORTS_DIR",
    "SQL_LINK_DIR",
    "SQL_MOUNTS_DIR",
    "WOW_DBC_DIR",
    # 错误类型
    "DBCConflictError",
    "MountPatchBuilderError",
    # 数据类
    "JobContext",
    "JobValidation",
    "ValidationResult",
    # 上下文与 IO
    "build_job_context",
    "ensure_sql_symlink",
    "find_jobs",
    "load_json",
    "load_yaml",
    "sanitize_model_folder",
    "save_json",
    # DBC 操作
    "apply_dbc_operations",
    "check_conflicts",
    "collect_dbc_operations",
    "find_existing_dbc_records",
    "load_dbc_record_ids",
    # SQL / MPQ / 报告
    "generate_sql",
    "build_mpq",
    "update_job_records",
    "validate_job",
    "write_validation_report",
    # 构建入口
    "build_mount_patches",
    # 包内私有助手（单测直接引用）
    "_build_delete_where_clause",
    "_clear_plans",
    "_collect_existing_sql_entries",
    "_dump_plans",
    "_job_item_entry",
    "_record_by_id",
]
