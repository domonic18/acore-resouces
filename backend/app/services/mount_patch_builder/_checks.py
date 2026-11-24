"""校验结果数据类与校验共享小助手。"""

from __future__ import annotations

import dataclasses
from typing import Any, cast


@dataclasses.dataclass
class ValidationResult:
    """单个校验项结果。"""

    name: str
    passed: bool
    expected: Any | None = None
    actual: Any | None = None
    message: str = ""
    severity: str = "error"  # error 或 warning


@dataclasses.dataclass
class JobValidation:
    """单个任务的校验汇总。"""

    job_id: str
    mount_name: str
    passed: bool
    checks: list[ValidationResult]


def _find_sql_record(sql_plan: dict[str, Any], table_name: str) -> dict[str, Any] | None:
    """在 sql-plan 中查找指定表的第一条记录。"""
    for table in sql_plan.get("tables", []):
        if table.get("name") == table_name and table.get("records"):
            return cast(dict[str, Any], table["records"][0])
    return None


def _is_ascii_path(path: str) -> bool:
    """检查路径是否全为 ASCII 且不含空格。"""
    if not path:
        return True
    if " " in path:
        return False
    try:
        path.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


def _normalize_path(path: str) -> str:
    """统一路径分隔符为正斜杠并转小写，用于比较。"""
    return path.replace("\\", "/").lower()
