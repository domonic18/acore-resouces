"""JWT 签发/校验、全局鉴权中间件与 FastAPI 依赖。

中间件只拦 `/api/` 前缀：静态资源、SPA 回退与 /health 天然放行（登录页本身
是 SPA 的一部分）。规则：任何已登录用户可 GET；写操作（非 GET）仅 admin，
例外清单见 WRITE_EXEMPTS。

角色边界：admin 不受限；viewer 按 `permissions`（dist/mount/pet/npc）访问对应
前缀——`/api/auth*` 自助恒通，`/api/dist*`、`/api/resources/<type>*`、`/api/preview*`
（任一资源查看权限即可，图标/缩略图跨类型共用）按权限放行，其余一律 403。

浏览器 `<a href>` 下载无法带 Authorization 头，下载/图片链接可用 ?token= 查询
参数兜底（会进入访问日志，仅用于内网分发场景）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import jwt
from fastapi import Depends, HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from app.core.config import settings

TOKEN_HEADER = "Authorization"
TOKEN_QUERY = "token"

# viewer 可配置的查看权限码（存 local_user.permissions JSON 数组）
PERMISSION_CODES = ("dist", "mount", "pet", "npc")

# 非 GET 但允许普通用户调用的端点（无状态查询类、本人自助操作）
WRITE_EXEMPTS: set[tuple[str, str]] = {
    ("POST", "/api/wowhead/search"),
    ("POST", "/api/settings/ai-config/test"),
    ("PUT", "/api/auth/me/password"),
}

PUBLIC_ENDPOINTS: set[tuple[str, str]] = {
    ("POST", "/api/auth/login"),
    # 分发站委托验证：路由内自校验 X-Delegation-Key
    ("POST", "/api/auth/verify"),
}


@dataclass
class AuthUser:
    """已认证用户（从 JWT 解出）。"""

    account_id: int
    username: str
    role: str  # 'admin' | 'viewer'
    permissions: frozenset[str] = field(default_factory=frozenset)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def has_perm(self, code: str) -> bool:
        """admin 隐式全量；viewer 按 JWT 中的权限集合判断。"""
        return self.is_admin or code in self.permissions


class AuthError(Exception):
    """鉴权失败（中间件捕获后转 HTTP 响应）。"""


def create_token(account_id: int, username: str, role: str, permissions: frozenset[str]) -> str:
    """签发 JWT；密钥缺失直接抛配置错误，绝不回退默认密钥。"""
    if not settings.auth_jwt_secret:
        raise AuthError("AUTH_JWT_SECRET 未配置：请在 backend/.env 中设置后再登录")
    payload: dict[str, Any] = {
        "sub": str(account_id),
        "username": username,
        "role": role,
        "perms": sorted(permissions),
    }
    return jwt.encode(payload, settings.auth_jwt_secret, algorithm="HS256")


def decode_token(token: str) -> AuthUser:
    """校验并解析 JWT，失败抛 AuthError。"""
    if not settings.auth_jwt_secret:
        raise AuthError("AUTH_JWT_SECRET 未配置")
    try:
        payload = jwt.decode(token, settings.auth_jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise AuthError(f"令牌无效：{exc}") from exc
    try:
        return AuthUser(
            account_id=int(payload["sub"]),
            username=str(payload["username"]),
            role=str(payload["role"]),
            permissions=frozenset(str(c) for c in payload.get("perms", [])),
        )
    except (KeyError, ValueError) as exc:
        raise AuthError("令牌载荷不完整") from exc


def _bearer_from_request(request: Request) -> str | None:
    """优先 Authorization: Bearer 头；浏览器 <a href> 下载回退 ?token= 查询参数。"""
    header = request.headers.get(TOKEN_HEADER)
    if header and header.lower().startswith("bearer "):
        token = header[7:].strip()
        if token:
            return token
    return request.query_params.get(TOKEN_QUERY) or None


def _viewer_permitted(user: AuthUser, path: str) -> bool:
    """viewer 按权限访问对应前缀；admin 恒通（调用方已先判 is_admin 时不会走到这）。"""
    if path.startswith("/api/auth"):
        return True
    if path.startswith("/api/dist"):
        return user.has_perm("dist")
    for code in ("mount", "pet", "npc"):
        if path.startswith(f"/api/resources/{code}"):
            return user.has_perm(code)
    # 图标/缩略图/M2 预览跨资源类型共用，任一资源查看权限即可
    if path.startswith("/api/preview"):
        return any(user.has_perm(code) for code in ("mount", "pet", "npc"))
    return False


class AuthMiddleware(BaseHTTPMiddleware):
    """对 /api/* 强制登录；写操作仅 admin（豁免清单除外）；viewer 按权限路由。"""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not request.url.path.startswith("/api/") or request.method == "OPTIONS":
            return await call_next(request)
        key = (request.method, request.url.path)
        if key in PUBLIC_ENDPOINTS:
            return await call_next(request)
        token = _bearer_from_request(request)
        if not token:
            return JSONResponse({"detail": "未登录，请先登录"}, status_code=401)
        try:
            user = decode_token(token)
        except AuthError as exc:
            return JSONResponse({"detail": str(exc)}, status_code=401)
        request.state.user = user
        if not user.is_admin and not _viewer_permitted(user, request.url.path):
            return JSONResponse({"detail": "权限不足：当前账号无权访问该内容"}, status_code=403)
        if request.method != "GET" and key not in WRITE_EXEMPTS and not user.is_admin:
            return JSONResponse({"detail": "权限不足：仅管理员可执行写操作"}, status_code=403)
        return await call_next(request)


def get_current_user(request: Request) -> AuthUser:
    """路由依赖：取中间件解析出的当前用户。"""
    user: AuthUser | None = getattr(request.state, "user", None)
    if user is None:  # pragma: no cover - 中间件已保证
        raise HTTPException(status_code=401, detail="未登录")
    return user


def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    """路由依赖：要求管理员（用于 GET 型管理端点，写操作已由中间件拦截）。"""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="权限不足：仅管理员可访问")
    return user
