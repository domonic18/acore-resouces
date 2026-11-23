"""账号认证 API：登录、当前用户、本地账号管理、分发站委托验证。

/login 与 /verify 为公开端点（verify 在路由内自校验 X-Delegation-Key）；
/accounts 读取与账号管理仅管理员（require_admin）；写操作由 AuthMiddleware
统一拦截，此处不再重复校验。/me/password 仅需登录（bootstrap admin 改密入口）。
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import AuthError, AuthUser, get_current_user, require_admin
from app.db.session import get_db
from app.services import auth_service
from app.services.auth_service import AccountNotFoundError, AuthServiceError, LocalAccount

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    account_id: int
    username: str
    role: str
    permissions: list[str]


class AccountResponse(BaseModel):
    account_id: int
    username: str
    role: str
    permissions: list[str]
    created_at: datetime
    last_login_at: datetime | None


class AccountCreateRequest(BaseModel):
    username: str
    password: str
    role: str
    permissions: list[str] = []


class RoleUpdateRequest(BaseModel):
    role: str


class PermissionsUpdateRequest(BaseModel):
    permissions: list[str]


class PasswordResetRequest(BaseModel):
    password: str


class OwnPasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str


class VerifyRequest(BaseModel):
    username: str
    password: str


def _account_response(account: LocalAccount) -> AccountResponse:
    return AccountResponse(
        account_id=account.account_id,
        username=account.username,
        role=account.role,
        permissions=account.permissions,
        created_at=account.created_at,
        last_login_at=account.last_login_at,
    )


def _service_error(exc: AuthServiceError) -> HTTPException:
    status = 404 if isinstance(exc, AccountNotFoundError) else 400
    return HTTPException(status_code=status, detail=str(exc))


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    """系统账号登录，签发 JWT。"""
    try:
        token, user = auth_service.login(db, payload.username, payload.password)
    except AuthError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except AuthServiceError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return LoginResponse(
        token=token,
        account_id=user.account_id,
        username=user.username,
        role=user.role,
        permissions=sorted(user.permissions),
    )


@router.post("/verify")
def verify(
    payload: VerifyRequest,
    x_delegation_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """分发站委托验证（公开端点，路由内自校验委托密钥）。

    密钥不符或验密失败统一返回 valid=false，不区分具体原因。
    """
    result = auth_service.verify_credentials(
        db, payload.username, payload.password, x_delegation_key
    )
    if result is None:
        return {"valid": False}
    return {"valid": True, **result}


@router.post("/logout")
def logout(user: AuthUser = Depends(get_current_user)) -> dict[str, str]:
    """登出（JWT 无状态，客户端删除令牌即可）。"""
    return {"detail": f"{user.username} 已登出"}


@router.get("/me")
def me(user: AuthUser = Depends(get_current_user)) -> dict[str, object]:
    """当前登录用户信息（前端启动引导用）。"""
    return {
        "account_id": user.account_id,
        "username": user.username,
        "role": user.role,
        "permissions": sorted(user.permissions),
    }


@router.get("/accounts", response_model=list[AccountResponse])
def list_accounts(
    search: str = "",
    limit: int = 50,
    db: Session = Depends(get_db),
    _admin: AuthUser = Depends(require_admin),
) -> list[AccountResponse]:
    """列出本地账号（仅管理员）。"""
    accounts = auth_service.list_users(db, search=search, limit=min(limit, 200))
    return [_account_response(a) for a in accounts]


@router.post("/accounts", response_model=AccountResponse, status_code=201)
def create_account(
    payload: AccountCreateRequest,
    db: Session = Depends(get_db),
    _admin: AuthUser = Depends(require_admin),
) -> AccountResponse:
    """新建本地账号（仅管理员）。"""
    try:
        account = auth_service.create_user(
            db, payload.username, payload.password, payload.role, payload.permissions
        )
    except AuthServiceError as exc:
        raise _service_error(exc) from exc
    return _account_response(account)


@router.put("/accounts/{account_id}/permissions", response_model=AccountResponse)
def set_account_permissions(
    account_id: int,
    payload: PermissionsUpdateRequest,
    db: Session = Depends(get_db),
    _admin: AuthUser = Depends(require_admin),
) -> AccountResponse:
    """修改账号查看权限（仅管理员）。"""
    try:
        account = auth_service.set_permissions(db, account_id, payload.permissions)
    except AuthServiceError as exc:
        raise _service_error(exc) from exc
    return _account_response(account)


@router.put("/accounts/{account_id}/role", response_model=AccountResponse)
def set_account_role(
    account_id: int,
    payload: RoleUpdateRequest,
    db: Session = Depends(get_db),
    admin: AuthUser = Depends(require_admin),
) -> AccountResponse:
    """修改账号角色（仅管理员，不能改自己）。"""
    try:
        account = auth_service.set_role(
            db, account_id, payload.role, acting_username=admin.username
        )
    except AuthServiceError as exc:
        raise _service_error(exc) from exc
    return _account_response(account)


@router.put("/accounts/{account_id}/password", response_model=AccountResponse)
def reset_account_password(
    account_id: int,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
    _admin: AuthUser = Depends(require_admin),
) -> AccountResponse:
    """管理员重置账号密码（仅管理员）。"""
    try:
        account = auth_service.reset_password(db, account_id, payload.password)
    except AuthServiceError as exc:
        raise _service_error(exc) from exc
    return _account_response(account)


@router.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    admin: AuthUser = Depends(require_admin),
) -> dict[str, str]:
    """删除本地账号（仅管理员，不能删自己）。"""
    try:
        auth_service.delete_user(db, account_id, acting_username=admin.username)
    except AuthServiceError as exc:
        raise _service_error(exc) from exc
    return {"detail": "账号已删除"}


@router.put("/me/password")
def change_own_password(
    payload: OwnPasswordChangeRequest,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
) -> dict[str, str]:
    """修改自己的密码（仅需登录，验旧密码）。"""
    try:
        auth_service.change_own_password(
            db, user.account_id, payload.old_password, payload.new_password
        )
    except AuthServiceError as exc:
        raise _service_error(exc) from exc
    return {"detail": "密码已更新"}
