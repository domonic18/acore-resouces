"""坐骑 SQL 数据库导入单元测试。"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from app.services import patch_db_applier as applier


def test_collect_sql_files_filters_by_mount_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    mounts = tmp_path / "mounts"
    (mounts / "0001_demo").mkdir(parents=True)
    (mounts / "0001_demo" / "0001_mount_add.sql").write_text("SELECT 1;")
    (mounts / "0002_other").mkdir()
    (mounts / "0002_other" / "0002_mount_add.sql").write_text("SELECT 1;")
    monkeypatch.setattr(applier.settings, "sql_mounts_dir", mounts)

    assert [p.name for p in applier.collect_sql_files()] == [
        "0001_mount_add.sql",
        "0002_mount_add.sql",
    ]
    assert [p.name for p in applier.collect_sql_files(mount_id=2)] == ["0002_mount_add.sql"]


def test_collect_sql_files_returns_empty_when_dir_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(applier.settings, "sql_mounts_dir", tmp_path / "missing")
    assert applier.collect_sql_files() == []


def test_file_hash_matches_uppercase_sha1(tmp_path: Path) -> None:
    path = tmp_path / "a.sql"
    path.write_bytes(b"SELECT 1;")
    expected = hashlib.sha1(b"SELECT 1;").hexdigest().upper()
    assert applier.file_hash(path) == expected


def test_classify_files_detects_statuses(tmp_path: Path) -> None:
    pending = tmp_path / "0001_pending.sql"
    pending.write_bytes(b"a")
    changed = tmp_path / "0002_changed.sql"
    changed.write_bytes(b"b")
    same = tmp_path / "0003_same.sql"
    same.write_bytes(b"c")

    applied = {
        "0002_changed.sql": "DIFFERENT",
        "0003_same.sql": applier.file_hash(same),
    }
    states = applier.classify_files([pending, changed, same], applied)

    assert [state.status for state in states] == [
        applier.STATUS_PENDING,
        applier.STATUS_CHANGED,
        applier.STATUS_APPLIED,
    ]
    assert states[0].needs_import and states[1].needs_import
    assert not states[2].needs_import


def test_read_env_value_parses_quotes(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text('# 注释\nFOO="bar"\nBAZ=qux\n', encoding="utf-8")
    assert applier._read_env_value(env, "FOO") == "bar"
    assert applier._read_env_value(env, "BAZ") == "qux"
    with pytest.raises(applier.DbApplyError):
        applier._read_env_value(env, "MISSING")


def test_load_db_credentials_parses_connection_string(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env = tmp_path / ".env"
    env.write_text(
        "AC_WORLD_DATABASE_INFO=host.docker.internal;3306;acore_test;secret;acore_world\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(applier.settings, "acore_deploy_dir", tmp_path)

    assert applier.load_db_credentials() == ("acore_test", "secret", "acore_world")


def test_record_applied_escapes_quotes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    statements: list[str] = []
    monkeypatch.setattr(applier, "run_mysql", lambda sql: statements.append(sql) or "")

    applier.record_applied("0001_o'brien.sql", "ABC123")

    assert statements[0] == (
        "REPLACE INTO `updates` (`name`, `hash`, `state`, `speed`) VALUES "
        "('0001_o''brien.sql', 'ABC123', 'MODULE', 0);"
    )


def test_apply_sql_files_dry_run_does_not_import(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sql = tmp_path / "0001_demo.sql"
    sql.write_bytes(b"a")
    monkeypatch.setattr(applier, "fetch_applied_updates", lambda: {})

    def _fail_import(path: Path) -> str:
        raise AssertionError("dry-run 不应触发导入")

    monkeypatch.setattr(applier, "import_sql_file", _fail_import)

    report = applier.apply_sql_files([sql], dry_run=True)

    assert len(report.pending) == 1
    assert report.imported == []
