"""坐骑数据在测试服数据库中的落地校验。

YAML 里声明的 ``creature_template`` / ``creature_model_info`` / ``item_template``
记录，只有真正写进 ``acore_world`` 之后，坐骑才会出现在游戏里。本模块把这些行
逐条与线上数据库比对，把「SQL 已导入但数据没落地」这类问题挡在提交前。

已知边界：数据库连接依赖 acore-deploy 仓库的 ``.env`` 与本地 MySQL 容器，
容器未启动时无法校验——此时应视为「跳过」而不是「通过」。
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from app.schemas.resource import Mount
from app.services.patch_db_applier import DbApplyError, run_mysql

TABLE_CREATURE_TEMPLATE = "creature_template"
TABLE_CREATURE_MODEL_INFO = "creature_model_info"
TABLE_ITEM_TEMPLATE = "item_template"
TABLE_CREATURE_TEMPLATE_MODEL = "creature_template_model"


@dataclass(frozen=True)
class DbRowCheck:
    """一行数据的落地情况。"""

    table: str
    key: str
    value: int
    found: bool

    @property
    def description(self) -> str:
        """人类可读的检查项描述。"""
        return f"{self.table}.{self.key}={self.value}"


@dataclass
class MountDbCheckResult:
    """单个坐骑的数据落地校验结果。"""

    resource_id: int
    model_folder: str
    name: str
    checks: list[DbRowCheck] = field(default_factory=list)

    @property
    def missing(self) -> list[DbRowCheck]:
        """缺失的行。"""
        return [check for check in self.checks if not check.found]

    @property
    def is_complete(self) -> bool:
        """是否所有行都已落地。"""
        return not self.missing


@dataclass
class MountDbCheckReport:
    """全部坐骑的数据落地校验结果汇总。"""

    results: list[MountDbCheckResult] = field(default_factory=list)
    skipped: bool = False
    skip_reason: str | None = None

    @property
    def error_count(self) -> int:
        """缺失行的总数。"""
        return sum(len(result.missing) for result in self.results)

    @property
    def failed_mounts(self) -> list[MountDbCheckResult]:
        """存在缺失行的坐骑。"""
        return [result for result in self.results if result.missing]


def _query_ids(table: str, column: str, values: set[int]) -> set[int]:
    """查询指定表中命中给定 ID 集合的行。

    Args:
        table: 表名。
        column: ID 列名。
        values: 待查询的 ID 集合。

    Returns:
        实际存在的 ID 集合。
    """
    if not values:
        return set()
    id_list = ",".join(str(value) for value in sorted(values))
    output = run_mysql(f"SELECT `{column}` FROM `{table}` WHERE `{column}` IN ({id_list});")
    found: set[int] = set()
    for line in output.splitlines():
        value = line.strip()
        if value.isdigit():
            found.add(int(value))
    return found


def _query_creatures_with_model(creature_ids: set[int]) -> set[int]:
    """查询拥有模型行的生物 ID。

    Args:
        creature_ids: 生物 entry 集合。

    Returns:
        在 ``creature_template_model`` 中至少有一行的生物 entry 集合。
    """
    if not creature_ids:
        return set()
    id_list = ",".join(str(value) for value in sorted(creature_ids))
    output = run_mysql(
        "SELECT DISTINCT `CreatureID` FROM `creature_template_model` "
        f"WHERE `CreatureID` IN ({id_list});"
    )
    found: set[int] = set()
    for line in output.splitlines():
        value = line.strip()
        if value.isdigit():
            found.add(int(value))
    return found


def check_mounts_db(mounts: Sequence[Mount]) -> MountDbCheckReport:
    """校验坐骑声明的数据行是否已落地到线上数据库。

    Args:
        mounts: 待校验的坐骑资源。

    Returns:
        校验结果汇总；数据库不可用时返回 skipped=True。
    """
    entries: set[int] = set()
    display_ids: set[int] = set()
    item_ids: set[int] = set()

    for mount in mounts:
        template = mount.db.creature_template
        model_info = mount.db.creature_model_info
        item = mount.db.item_template
        if template.entry:
            entries.add(template.entry)
        if model_info.display_id:
            display_ids.add(model_info.display_id)
        if item.entry:
            item_ids.add(item.entry)

    try:
        found_entries = _query_ids(TABLE_CREATURE_TEMPLATE, "entry", entries)
        found_display_ids = _query_ids(TABLE_CREATURE_MODEL_INFO, "DisplayID", display_ids)
        found_item_ids = _query_ids(TABLE_ITEM_TEMPLATE, "entry", item_ids)
        with_model = _query_creatures_with_model(entries)
    except DbApplyError as exc:
        return MountDbCheckReport(results=[], skipped=True, skip_reason=str(exc))

    results: list[MountDbCheckResult] = []
    for mount in mounts:
        template = mount.db.creature_template
        model_info = mount.db.creature_model_info
        item = mount.db.item_template

        checks: list[DbRowCheck] = []
        if template.entry:
            checks.append(
                DbRowCheck(
                    TABLE_CREATURE_TEMPLATE,
                    "entry",
                    template.entry,
                    template.entry in found_entries,
                )
            )
            checks.append(
                DbRowCheck(
                    TABLE_CREATURE_TEMPLATE_MODEL,
                    "CreatureID",
                    template.entry,
                    template.entry in with_model,
                )
            )
        if model_info.display_id:
            checks.append(
                DbRowCheck(
                    TABLE_CREATURE_MODEL_INFO,
                    "DisplayID",
                    model_info.display_id,
                    model_info.display_id in found_display_ids,
                )
            )
        if item.entry:
            checks.append(
                DbRowCheck(
                    TABLE_ITEM_TEMPLATE,
                    "entry",
                    item.entry,
                    item.entry in found_item_ids,
                )
            )

        results.append(
            MountDbCheckResult(
                resource_id=mount.id,
                model_folder=mount.model_folder,
                name=template.name or mount.model_folder,
                checks=checks,
            )
        )

    return MountDbCheckReport(results=results)
