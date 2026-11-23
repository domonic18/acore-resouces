"""坐骑 SQL 的线上数据库导入。

把「仓库里的 SQL 文件 → 测试服 acore_world 库」这一步封装起来，避免每次都手拼
docker exec mysql 命令，也避免把账号密码写进脚本或日志。

判定「是否已导入」的依据是 ``acore_world.updates`` 表：AzerothCore 的
UpdateFetcher 以**文件名**为主键、以**文件内容的 SHA1** 判断是否需要重放。
因此本模块的状态分为三种：

- ``pending``：表里没有这个文件名 → 还没导入过；
- ``changed``：表里有，但哈希与当前文件不一致 → 文件被改过，需要重放；
- ``applied``：表里有且哈希一致 → 已是最新。

导入动作本身委托给 acore-deploy 仓库的 ``acore-update-db.sh``（与
docs/arch/03Agent交互架构.md 的约定一致），导入成功后把文件登记进 ``updates``
表，保持与 AzerothCore 自动更新器的状态一致，避免下次 dbimport 重复重放。
"""

from __future__ import annotations

import hashlib
import logging
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

STATUS_APPLIED = "applied"
STATUS_CHANGED = "changed"
STATUS_PENDING = "pending"

STATE_MODULE = "MODULE"


class DbApplyError(RuntimeError):
    """数据库导入失败。"""


@dataclass(frozen=True)
class SqlFileState:
    """单个 SQL 文件的导入状态。"""

    path: Path
    name: str
    content_hash: str
    applied_hash: str | None

    @property
    def status(self) -> str:
        """文件相对线上数据库的状态。"""
        if self.applied_hash is None:
            return STATUS_PENDING
        if self.applied_hash.upper() == self.content_hash.upper():
            return STATUS_APPLIED
        return STATUS_CHANGED

    @property
    def is_applied(self) -> bool:
        """是否已是最新（无需导入）。"""
        return self.status == STATUS_APPLIED

    @property
    def needs_import(self) -> bool:
        """是否需要导入（从未导入或内容有改动）。"""
        return self.status in (STATUS_PENDING, STATUS_CHANGED)


@dataclass
class DbApplyReport:
    """导入结果汇总。"""

    states: list[SqlFileState] = field(default_factory=list)
    imported: list[SqlFileState] = field(default_factory=list)
    failed: list[tuple[SqlFileState, str]] = field(default_factory=list)

    @property
    def pending(self) -> list[SqlFileState]:
        """从未导入过的文件。"""
        return [state for state in self.states if state.status == STATUS_PENDING]

    @property
    def changed(self) -> list[SqlFileState]:
        """内容有改动的文件。"""
        return [state for state in self.states if state.status == STATUS_CHANGED]

    @property
    def applied(self) -> list[SqlFileState]:
        """已是最新、无需导入的文件。"""
        return [state for state in self.states if state.status == STATUS_APPLIED]


def collect_sql_files(mount_id: int | None = None) -> list[Path]:
    """收集坐骑 SQL 文件。

    Args:
        mount_id: 只收集该坐骑 ID 的文件；None 表示全部。

    Returns:
        按文件名排序的 SQL 文件路径列表。
    """
    directory = settings.sql_mounts_dir
    if not directory.is_dir():
        return []
    files = sorted(
        (path for path in directory.rglob("*.sql") if path.is_file()), key=lambda p: p.name
    )
    if mount_id is not None:
        prefix = f"{mount_id:04d}"
        files = [path for path in files if path.name.startswith(prefix)]
    return files


def file_hash(path: Path) -> str:
    """计算 SQL 文件内容的 SHA1。

    Args:
        path: SQL 文件路径。

    Returns:
        大写十六进制哈希，与 AzerothCore ``updates.hash`` 的格式一致。
    """
    return hashlib.sha1(path.read_bytes()).hexdigest().upper()


def _read_env_value(env_path: Path, key: str) -> str:
    """从 .env 文件读取指定键的值（不做 shell 展开）。"""
    if not env_path.is_file():
        raise DbApplyError(f"找不到部署配置文件：{env_path}")
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        if name.strip() != key:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        return value
    raise DbApplyError(f"{env_path} 中缺少 {key}")


def load_db_credentials() -> tuple[str, str, str]:
    """读取 world 库的用户名、密码与库名。

    Returns:
        (user, password, database)。
    """
    env_path = settings.acore_deploy_dir / ".env"
    conn = _read_env_value(env_path, "AC_WORLD_DATABASE_INFO")
    parts = conn.split(";")
    if len(parts) < 5:
        raise DbApplyError(f"AC_WORLD_DATABASE_INFO 格式不正确：{conn!r}")
    _host, _port, user, password, database = parts[:5]
    return user, password, database


def run_mysql(sql: str) -> str:
    """在 MySQL 容器内执行一条 SQL 并返回输出。

    Args:
        sql: 待执行的 SQL（可含多条语句，以分号分隔）。

    Returns:
        mysql 客户端的标准输出。

    Raises:
        DbApplyError: 容器不存在或 SQL 执行失败。
    """
    user, password, database = load_db_credentials()
    result = subprocess.run(
        [
            "docker",
            "exec",
            "-e",
            f"MYSQL_PWD={password}",
            settings.acore_mysql_container,
            "mysql",
            "-u",
            user,
            database,
            "-N",
            "-B",
            "-e",
            sql,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise DbApplyError(f"MySQL 执行失败：{result.stderr.strip() or result.stdout.strip()}")
    return result.stdout


def fetch_applied_updates() -> dict[str, str]:
    """读取线上 ``updates`` 表。

    Returns:
        {文件名: 记录的哈希}。
    """
    output = run_mysql("SELECT `name`, `hash` FROM `updates`;")
    applied: dict[str, str] = {}
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2 and parts[0]:
            applied[parts[0]] = parts[1]
    return applied


def record_applied(name: str, content_hash: str) -> None:
    """把已导入的文件登记进 ``updates`` 表。

    登记的内容与 AzerothCore UpdateFetcher 写入的格式一致，使自动更新器不会
    在下次运行时重复重放同一个文件。

    Args:
        name: SQL 文件名。
        content_hash: 文件内容的 SHA1（大写十六进制）。
    """
    safe_name = name.replace("\\", "\\\\").replace("'", "''")
    safe_hash = content_hash.replace("\\", "\\\\").replace("'", "''")
    run_mysql(
        "REPLACE INTO `updates` (`name`, `hash`, `state`, `speed`) VALUES "
        f"('{safe_name}', '{safe_hash}', '{STATE_MODULE}', 0);"
    )


def import_sql_file(path: Path) -> str:
    """通过 acore-update-db.sh 把单个 SQL 文件导入 world 库。

    Args:
        path: SQL 文件路径。

    Returns:
        导入脚本的标准输出。

    Raises:
        DbApplyError: 脚本不存在或导入失败。
    """
    script = settings.acore_deploy_dir / "scripts" / "acore-update-db.sh"
    if not script.is_file():
        raise DbApplyError(f"找不到导入脚本：{script}")
    result = subprocess.run(
        [
            str(script),
            "--sql-file",
            str(path),
            "--database",
            settings.acore_world_database,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise DbApplyError(f"导入失败：{result.stderr.strip() or result.stdout.strip()}")
    return result.stdout


def classify_files(files: list[Path], applied: dict[str, str]) -> list[SqlFileState]:
    """判定每个 SQL 文件相对线上数据库的状态。

    Args:
        files: SQL 文件路径列表。
        applied: {文件名: 记录哈希}。

    Returns:
        每个文件的状态。
    """
    states: list[SqlFileState] = []
    for path in files:
        states.append(
            SqlFileState(
                path=path,
                name=path.name,
                content_hash=file_hash(path),
                applied_hash=applied.get(path.name),
            )
        )
    return states


def apply_sql_files(
    files: list[Path],
    *,
    include_changed: bool = False,
    dry_run: bool = False,
    progress: Any = None,
) -> DbApplyReport:
    """把待导入的坐骑 SQL 导入线上 world 库。

    Args:
        files: 候选 SQL 文件路径列表。
        include_changed: 是否连同「内容有改动」的文件一起重新导入。
        dry_run: 只统计不导入。
        progress: 可选的进度回调，签名为 (message: str) -> None。

    Returns:
        导入结果汇总。
    """
    applied_map = fetch_applied_updates()
    states = classify_files(files, applied_map)
    report = DbApplyReport(states=states)

    targets = [
        state
        for state in states
        if state.status == STATUS_PENDING or (include_changed and state.status == STATUS_CHANGED)
    ]
    if dry_run:
        return report

    for state in targets:
        if progress is not None:
            progress(f"导入 {state.name} …")
        try:
            import_sql_file(state.path)
        except DbApplyError as exc:
            logger.error("导入 %s 失败：%s", state.name, exc)
            report.failed.append((state, str(exc)))
            continue
        record_applied(state.name, state.content_hash)
        report.imported.append(state)

    return report
