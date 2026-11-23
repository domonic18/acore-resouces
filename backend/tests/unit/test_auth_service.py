"""auth_service 单元测试：bootstrap、登录、委托验证与本地账号 CRUD（临时 SQLite）。"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.security import AuthError
from app.models.local_user import LocalUser
from app.services import auth_service
from app.services.auth_service import AccountNotFoundError, AuthServiceError

JWT_SECRET = "unit-test-secret-0123456789abcdef-32bytes!"
DELEGATION_KEY = "delegation-key-0123456789abcdef"


@pytest.fixture
def db(tmp_path: Path) -> Session:
    """独立临时 SQLite 会话，含 local_user 表。"""
    engine = create_engine(f"sqlite:///{tmp_path / 'auth_test.db'}")
    LocalUser.__table__.create(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_jwt_secret", JWT_SECRET)
    monkeypatch.setattr(settings, "auth_bootstrap_admin_password", "bootstrap-pass-123")
    monkeypatch.setattr(settings, "auth_delegation_key", DELEGATION_KEY)


def _user_count(db: Session) -> int:
    return db.query(LocalUser).count()


# ---------- bootstrap ----------


def test_bootstrap_creates_admin(db: Session, configured: None) -> None:
    auth_service.ensure_bootstrapped(db)
    assert _user_count(db) == 1
    admin = db.query(LocalUser).filter(LocalUser.username == "admin").one()
    assert admin.role == "admin"


def test_bootstrap_skips_when_users_exist(db: Session, configured: None) -> None:
    auth_service.create_user(db, "someone", "password-123", "viewer")
    auth_service.ensure_bootstrapped(db)
    assert _user_count(db) == 1


def test_bootstrap_without_password_leaves_table_empty(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "auth_bootstrap_admin_password", "")
    auth_service.ensure_bootstrapped(db)
    assert _user_count(db) == 0


def test_login_without_bootstrap_reports_config_error(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "auth_bootstrap_admin_password", "")
    with pytest.raises(AuthServiceError, match="AUTH_BOOTSTRAP_ADMIN_PASSWORD"):
        auth_service.login(db, "admin", "whatever")


# ---------- login ----------


def test_login_success_updates_last_login(db: Session, configured: None) -> None:
    auth_service.ensure_bootstrapped(db)
    token, user = auth_service.login(db, "admin", "bootstrap-pass-123")
    assert token
    assert user.username == "admin" and user.role == "admin" and user.is_admin
    row = db.query(LocalUser).one()
    assert row.last_login_at is not None


def test_login_case_insensitive_username(db: Session, configured: None) -> None:
    auth_service.create_user(db, "Trader", "password-123", "viewer")
    token, user = auth_service.login(db, "trader", "password-123")
    assert user.username == "Trader"


def test_login_wrong_password(db: Session, configured: None) -> None:
    auth_service.ensure_bootstrapped(db)
    with pytest.raises(AuthServiceError, match="账号或密码错误"):
        auth_service.login(db, "admin", "wrong-pass")


def test_login_unknown_account(db: Session, configured: None) -> None:
    auth_service.ensure_bootstrapped(db)
    with pytest.raises(AuthServiceError, match="账号或密码错误"):
        auth_service.login(db, "ghost", "password-123")


def test_login_requires_jwt_secret(
    db: Session, configured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "auth_jwt_secret", "")
    auth_service.ensure_bootstrapped(db)
    with pytest.raises(AuthError, match="AUTH_JWT_SECRET"):
        auth_service.login(db, "admin", "bootstrap-pass-123")


# ---------- verify_credentials（分发站委托） ----------


def test_verify_success(db: Session, configured: None) -> None:
    auth_service.ensure_bootstrapped(db)
    result = auth_service.verify_credentials(db, "admin", "bootstrap-pass-123", DELEGATION_KEY)
    assert result == {"account_id": 1, "username": "admin", "role": "admin"}
    assert db.query(LocalUser).one().last_login_at is None


def test_verify_rejects_wrong_key(db: Session, configured: None) -> None:
    auth_service.ensure_bootstrapped(db)
    assert auth_service.verify_credentials(db, "admin", "bootstrap-pass-123", "bad-key") is None


def test_verify_rejects_missing_key(db: Session, configured: None) -> None:
    auth_service.ensure_bootstrapped(db)
    assert auth_service.verify_credentials(db, "admin", "bootstrap-pass-123", None) is None


def test_verify_rejects_bad_credentials(db: Session, configured: None) -> None:
    assert auth_service.verify_credentials(db, "admin", "wrong-pass", DELEGATION_KEY) is None


def test_verify_disabled_without_key(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_delegation_key", "")
    auth_service.ensure_bootstrapped(db)
    assert (
        auth_service.verify_credentials(db, "admin", "bootstrap-pass-123", DELEGATION_KEY) is None
    )


# ---------- 账号 CRUD ----------


def test_create_user_success(db: Session, configured: None) -> None:
    account = auth_service.create_user(db, "trader", "password-123", "viewer")
    assert account.username == "trader" and account.role == "viewer"
    assert _user_count(db) == 1


def test_create_user_duplicate_rejected(db: Session, configured: None) -> None:
    auth_service.create_user(db, "trader", "password-123", "viewer")
    with pytest.raises(AuthServiceError, match="用户名已存在"):
        auth_service.create_user(db, "Trader", "password-456", "admin")


def test_create_user_short_password_rejected(db: Session, configured: None) -> None:
    with pytest.raises(AuthServiceError, match="密码长度"):
        auth_service.create_user(db, "trader", "short", "viewer")


def test_create_user_invalid_role_rejected(db: Session, configured: None) -> None:
    with pytest.raises(AuthServiceError, match="角色无效"):
        auth_service.create_user(db, "trader", "password-123", "root")


def test_set_role_success_and_refuse_self(db: Session, configured: None) -> None:
    auth_service.ensure_bootstrapped(db)
    target = auth_service.create_user(db, "trader", "password-123", "viewer")
    updated = auth_service.set_role(db, target.account_id, "admin", acting_username="admin")
    assert updated.role == "admin"
    admin = db.query(LocalUser).filter(LocalUser.username == "admin").one()
    with pytest.raises(AuthServiceError, match="不能修改自己的角色"):
        auth_service.set_role(db, admin.id, "viewer", acting_username="admin")


def test_set_role_invalid_role_and_missing_account(db: Session, configured: None) -> None:
    with pytest.raises(AuthServiceError, match="角色无效"):
        auth_service.set_role(db, 999, "root", acting_username="admin")
    with pytest.raises(AccountNotFoundError):
        auth_service.set_role(db, 999, "admin", acting_username="admin")


def test_reset_password(db: Session, configured: None) -> None:
    account = auth_service.create_user(db, "trader", "password-123", "viewer")
    auth_service.reset_password(db, account.account_id, "new-pass-456")
    _, user = auth_service.login(db, "trader", "new-pass-456")
    assert user.username == "trader"
    with pytest.raises(AuthServiceError, match="密码长度"):
        auth_service.reset_password(db, account.account_id, "short")


def test_delete_user_refuses_self(db: Session, configured: None) -> None:
    auth_service.ensure_bootstrapped(db)
    admin = db.query(LocalUser).one()
    with pytest.raises(AuthServiceError, match="不能删除自己的账号"):
        auth_service.delete_user(db, admin.id, acting_username="admin")
    target = auth_service.create_user(db, "trader", "password-123", "viewer")
    auth_service.delete_user(db, target.account_id, acting_username="admin")
    assert _user_count(db) == 1


def test_delete_missing_account(db: Session, configured: None) -> None:
    with pytest.raises(AccountNotFoundError):
        auth_service.delete_user(db, 999, acting_username="admin")


# ---------- 本人改密 ----------


def test_change_own_password_flow(db: Session, configured: None) -> None:
    account = auth_service.create_user(db, "trader", "password-123", "viewer")
    with pytest.raises(AuthServiceError, match="旧密码错误"):
        auth_service.change_own_password(db, account.account_id, "bad-old", "new-pass-456")
    auth_service.change_own_password(db, account.account_id, "password-123", "new-pass-456")
    _, user = auth_service.login(db, "trader", "new-pass-456")
    assert user.username == "trader"


def test_change_own_password_validates_length(db: Session, configured: None) -> None:
    account = auth_service.create_user(db, "trader", "password-123", "viewer")
    with pytest.raises(AuthServiceError, match="密码长度"):
        auth_service.change_own_password(db, account.account_id, "password-123", "short")


def test_change_password_missing_account(db: Session, configured: None) -> None:
    with pytest.raises(AccountNotFoundError):
        auth_service.change_own_password(db, 999, "password-123", "new-pass-456")


# ---------- 查看权限（permissions） ----------


def test_create_user_with_permissions(db: Session, configured: None) -> None:
    account = auth_service.create_user(
        db, "player", "password-123", "viewer", ["mount", "dist"]
    )
    assert account.permissions == ["dist", "mount"]
    _, user = auth_service.login(db, "player", "password-123")
    assert user.permissions == frozenset({"dist", "mount"})


def test_create_user_default_permissions_empty(db: Session, configured: None) -> None:
    account = auth_service.create_user(db, "player", "password-123", "viewer")
    assert account.permissions == []


def test_create_user_unknown_permission_rejected(db: Session, configured: None) -> None:
    with pytest.raises(AuthServiceError, match="权限无效"):
        auth_service.create_user(db, "player", "password-123", "viewer", ["hack"])


def test_set_permissions_dedup_sort_and_validate(db: Session, configured: None) -> None:
    account = auth_service.create_user(db, "player", "password-123", "viewer")
    updated = auth_service.set_permissions(
        db, account.account_id, ["npc", "mount", "npc"]
    )
    assert updated.permissions == ["mount", "npc"]
    with pytest.raises(AuthServiceError, match="权限无效"):
        auth_service.set_permissions(db, account.account_id, ["admin"])
    with pytest.raises(AccountNotFoundError):
        auth_service.set_permissions(db, 999, ["dist"])


def test_legacy_table_migration_defaults_viewer_perms(tmp_path: Path) -> None:
    """存量库（无 permissions 列）经 _ensure_local_table ALTER 后，viewer 默认获得 dist 权限。"""
    import sqlalchemy

    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as conn:
        conn.execute(
            sqlalchemy.text(
                """
                CREATE TABLE local_user (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username VARCHAR NOT NULL,
                    password_hash VARCHAR NOT NULL,
                    role VARCHAR NOT NULL,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    last_login_at DATETIME,
                    CONSTRAINT uq_local_user_username UNIQUE (username)
                )
                """
            )
        )
        conn.execute(
            sqlalchemy.text(
                "INSERT INTO local_user (username, password_hash, role, created_at, updated_at)"
                " VALUES ('old-player', 'x', 'viewer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )
    session = sessionmaker(bind=engine)()
    try:
        auth_service._ensure_local_table(session)
        account = auth_service.list_users(session)[0]
        assert account.permissions == ["dist"]
    finally:
        session.close()
