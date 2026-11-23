"""账号中心：本系统自建账号的认证与 CRUD（分发站经 verify 委托验证）。

登录流程：SQLite `local_user` 表（bcrypt 哈希）校验 → 更新 last_login_at →
签发 JWT（含 perms 权限集合）。首次启动且用户表为空时，用
AUTH_BOOTSTRAP_ADMIN_PASSWORD 创建初始 admin 账号；未配置则登录接口返回明确的
配置错误提示。viewer 权限（dist/mount/pet/npc）存 permissions JSON 列；
admin 隐式全量。
"""

from __future__ import annotations

import hmac
import json
from dataclasses import dataclass
from datetime import datetime

import bcrypt
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import PERMISSION_CODES, AuthError, AuthUser, create_token
from app.db.session import Base
from app.models.local_user import LocalUser

BOOTSTRAP_MISSING = (
    "账号尚未初始化：请在 backend/.env 设置 AUTH_BOOTSTRAP_ADMIN_PASSWORD 后重启，"
    "系统将自动创建初始 admin 账号"
)

MIN_PASSWORD_LENGTH = 8

ROLES = ("admin", "viewer")

# 存量库 ALTER 迁移的默认值：既有 viewer（玩家）保留下载权限，行为不变
_LEGACY_VIEWER_PERMS = '["dist"]'


class AuthServiceError(Exception):
    """登录/账号管理失败（用户可见，API 层转 4xx）。"""


class AccountNotFoundError(AuthServiceError):
    """按 ID 未找到本地账号（API 层转 404）。"""


@dataclass
class LocalAccount:
    """本地账号摘要（不含密码哈希，供 API 响应）。"""

    account_id: int
    username: str
    role: str
    permissions: list[str]
    created_at: datetime
    last_login_at: datetime | None


def _ensure_local_table(db: Session) -> None:
    """确保 local_user 表存在；存量库缺 permissions 列时 ALTER 补齐（幂等）。

    无迁移框架，靠 create_all（新库）+ PRAGMA 探测（旧库）双路径；ALTER 默认值
    让既有 viewer 保留下载权限。
    """
    engine = db.get_bind()
    Base.metadata.create_all(bind=engine, tables=[LocalUser.__table__])
    columns = {row[1] for row in db.execute(text("PRAGMA table_info(local_user)")).fetchall()}
    if "permissions" not in columns:
        db.execute(
            text(
                f"ALTER TABLE local_user ADD COLUMN permissions VARCHAR NOT NULL "
                f"DEFAULT '{_LEGACY_VIEWER_PERMS}'"
            )
        )
        db.commit()


def _parse_permissions(raw: str | None) -> list[str]:
    """解析权限 JSON；未知码过滤，坏值回退空集。"""
    try:
        values = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    if not isinstance(values, list):
        return []
    known = set(PERMISSION_CODES)
    return sorted({v for v in values if isinstance(v, str) and v in known})


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False


def _validate_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AuthServiceError(f"密码长度至少 {MIN_PASSWORD_LENGTH} 位")


def _find_user(db: Session, username: str) -> LocalUser | None:
    """按用户名查用户（大小写不敏感，与登录行为一致）。"""
    return (
        db.query(LocalUser).filter(func.upper(LocalUser.username) == func.upper(username)).first()
    )


def ensure_bootstrapped(db: Session) -> None:
    """首次启动：用户表为空时用初始密码创建 admin 账号（幂等）。"""
    _ensure_local_table(db)
    if db.query(func.count(LocalUser.id)).scalar():
        return
    password = settings.auth_bootstrap_admin_password
    if not password:
        return
    _create_user_row(db, username="admin", password=password, role="admin")


def _create_user_row(
    db: Session,
    *,
    username: str,
    password: str,
    role: str,
    permissions: list[str] | None = None,
) -> LocalUser:
    now = datetime.now()
    user = LocalUser(
        username=username,
        password_hash=_hash_password(password),
        role=role,
        permissions=json.dumps(_validate_permissions(permissions or [])),
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    return user


def _validate_permissions(permissions: list[str]) -> list[str]:
    """权限码校验 + 去重排序；admin 的权限集合同样存储（使用时被忽略）。"""
    unknown = [p for p in permissions if p not in PERMISSION_CODES]
    if unknown:
        raise AuthServiceError(
            f"权限无效：{'、'.join(unknown)}（可选 {'/'.join(PERMISSION_CODES)}）"
        )
    return sorted(set(permissions))


def login(db: Session, username: str, password: str) -> tuple[str, AuthUser]:
    """系统账号登录，成功返回 (JWT, 当前用户)。失败抛 AuthServiceError/AuthError。"""
    ensure_bootstrapped(db)
    if not db.query(func.count(LocalUser.id)).scalar():
        raise AuthServiceError(BOOTSTRAP_MISSING)
    if not settings.auth_jwt_secret:
        raise AuthError("AUTH_JWT_SECRET 未配置：请在 backend/.env 设置后重启")
    user = _find_user(db, username)
    if user is None or not _verify_password(password, user.password_hash):
        raise AuthServiceError("账号或密码错误")
    user.last_login_at = datetime.now()
    db.commit()
    permissions = frozenset(_parse_permissions(user.permissions))
    token = create_token(user.id, user.username, user.role, permissions)
    return token, AuthUser(
        account_id=user.id,
        username=user.username,
        role=user.role,
        permissions=permissions,
    )


def verify_credentials(
    db: Session,
    username: str,
    password: str,
    delegation_key: str | None,
) -> dict[str, object] | None:
    """分发站委托验证：恒时比较委托密钥，验密成功返回用户摘要，失败返回 None。

    委托密钥未配置时一律拒绝（verify 端点整体禁用）；不更新 last_login_at。
    """
    expected = settings.auth_delegation_key
    if not expected or not delegation_key or not hmac.compare_digest(expected, delegation_key):
        return None
    user = _find_user(db, username)
    if user is None or not _verify_password(password, user.password_hash):
        return None
    return {
        "account_id": user.id,
        "username": user.username,
        "role": user.role,
    }


def _to_account(user: LocalUser) -> LocalAccount:
    return LocalAccount(
        account_id=user.id,
        username=user.username,
        role=user.role,
        permissions=_parse_permissions(user.permissions),
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


def _get_user(db: Session, account_id: int) -> LocalUser:
    user = db.query(LocalUser).filter(LocalUser.id == account_id).first()
    if user is None:
        raise AccountNotFoundError(f"账号不存在：{account_id}")
    return user


def list_users(db: Session, search: str = "", limit: int = 50) -> list[LocalAccount]:
    """列出本地账号（按 id 升序），支持用户名模糊过滤。"""
    query = db.query(LocalUser)
    if search:
        query = query.filter(LocalUser.username.ilike(f"%{search}%"))
    return [_to_account(u) for u in query.order_by(LocalUser.id).limit(limit).all()]


def create_user(
    db: Session,
    username: str,
    password: str,
    role: str,
    permissions: list[str] | None = None,
) -> LocalAccount:
    """创建本地账号：用户名唯一（大小写不敏感）、密码 ≥ 8 位、角色限定 admin/viewer。"""
    if role not in ROLES:
        raise AuthServiceError(f"角色无效：{role}（可选 {'/'.join(ROLES)}）")
    if not username.strip():
        raise AuthServiceError("用户名不能为空")
    _validate_new_password(password)
    _validate_permissions(permissions or [])
    if _find_user(db, username) is not None:
        raise AuthServiceError(f"用户名已存在：{username}")
    user = _create_user_row(
        db, username=username.strip(), password=password, role=role, permissions=permissions
    )
    return _to_account(user)


def set_permissions(db: Session, account_id: int, permissions: list[str]) -> LocalAccount:
    """修改账号查看权限（仅 admin 调用）；admin 自身权限集被忽略，仅存储。"""
    validated = _validate_permissions(permissions)
    user = _get_user(db, account_id)
    user.permissions = json.dumps(validated)
    user.updated_at = datetime.now()
    db.commit()
    return _to_account(user)


def set_role(db: Session, account_id: int, role: str, *, acting_username: str) -> LocalAccount:
    """修改账号角色（仅 admin 调用）；禁止修改自己的角色。"""
    if role not in ROLES:
        raise AuthServiceError(f"角色无效：{role}（可选 {'/'.join(ROLES)}）")
    user = _get_user(db, account_id)
    if user.username == acting_username:
        raise AuthServiceError("不能修改自己的角色")
    user.role = role
    user.updated_at = datetime.now()
    db.commit()
    return _to_account(user)


def reset_password(db: Session, account_id: int, new_password: str) -> LocalAccount:
    """管理员重置账号密码（无需旧密码）。"""
    user = _get_user(db, account_id)
    _validate_new_password(new_password)
    user.password_hash = _hash_password(new_password)
    user.updated_at = datetime.now()
    db.commit()
    return _to_account(user)


def delete_user(db: Session, account_id: int, *, acting_username: str) -> None:
    """删除本地账号；禁止删除自己的账号。"""
    user = _get_user(db, account_id)
    if user.username == acting_username:
        raise AuthServiceError("不能删除自己的账号")
    db.delete(user)
    db.commit()


def change_own_password(db: Session, account_id: int, old_password: str, new_password: str) -> None:
    """本人改密：校验旧密码后写入新密码（bootstrap admin 的首次改密入口）。"""
    user = _get_user(db, account_id)
    if not _verify_password(old_password, user.password_hash):
        raise AuthServiceError("旧密码错误")
    _validate_new_password(new_password)
    user.password_hash = _hash_password(new_password)
    user.updated_at = datetime.now()
    db.commit()
