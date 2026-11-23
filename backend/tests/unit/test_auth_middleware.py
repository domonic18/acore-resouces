"""AuthMiddleware 规则测试：放行清单、401/403、写操作豁免。"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import AuthMiddleware, create_token


@pytest.fixture
def secret(monkeypatch: pytest.MonkeyPatch) -> str:
    value = "unit-test-secret-0123456789abcdef-32bytes!"
    monkeypatch.setattr(settings, "auth_jwt_secret", value)
    return value


@pytest.fixture
def client(secret: str) -> TestClient:
    """挂了 AuthMiddleware 的最小应用，路由只回显方法。"""
    app = FastAPI()
    app.add_middleware(AuthMiddleware)

    @app.get("/api/demo")
    @app.post("/api/demo")
    @app.put("/api/demo")
    @app.delete("/api/demo")
    def demo() -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/api/dist/tree")
    def dist_tree() -> dict[str, str]:
        return {"ok": "tree"}

    @app.get("/api/dist/download/{path:path}")
    def dist_download(path: str) -> dict[str, str]:
        return {"ok": path}

    @app.get("/api/resources/{resource_type}")
    def list_resources(resource_type: str) -> dict[str, str]:
        return {"ok": resource_type}

    @app.get("/api/resources/{resource_type}/{resource_id}/relationships")
    def resource_relationships(resource_type: str, resource_id: int) -> dict[str, str]:
        return {"ok": f"{resource_type}/{resource_id}"}

    @app.get("/api/preview/icon/{icon_name}")
    def preview_icon(icon_name: str) -> dict[str, str]:
        return {"ok": icon_name}

    @app.post("/api/auth/login")
    def login() -> dict[str, str]:
        return {"ok": "login"}

    @app.post("/api/auth/verify")
    def verify() -> dict[str, str]:
        return {"ok": "verify"}

    @app.post("/api/wowhead/search")
    def wowhead_search() -> dict[str, str]:
        return {"ok": "search"}

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/assets/app.js")
    def asset() -> dict[str, str]:
        return {"ok": "asset"}

    return TestClient(app, raise_server_exceptions=False)


def _token(
    secret: str, role: str = "viewer", perms: frozenset[str] = frozenset()
) -> str:
    return create_token(1, "tester", role, perms)


def _auth(
    secret: str, role: str = "viewer", perms: frozenset[str] = frozenset()
) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(secret, role, perms)}"}


def _perms(*codes: str) -> frozenset[str]:
    return frozenset(codes)


def test_health_and_static_bypass_auth(client: TestClient) -> None:
    assert client.get("/health").status_code == 200
    assert client.get("/assets/app.js").status_code == 200


def test_login_endpoint_is_public(client: TestClient) -> None:
    assert client.post("/api/auth/login").status_code == 200


def test_verify_endpoint_is_public(client: TestClient) -> None:
    """分发站委托验证公开放行，密钥校验由路由内部完成。"""
    assert client.post("/api/auth/verify").status_code == 200


def test_options_prefetch_passes(client: TestClient) -> None:
    assert client.options("/api/demo").status_code in (200, 405)


def test_missing_token_rejected(client: TestClient) -> None:
    assert client.get("/api/demo").status_code == 401


def test_bad_token_rejected(client: TestClient) -> None:
    assert client.get("/api/demo", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_viewer_write_rule_inside_allowed_prefix(client: TestClient, secret: str) -> None:
    """viewer 在权限放行的前缀内仍受写规则约束：GET 可用，非 GET 拒绝（写规则先于路由）。"""
    headers = _auth(secret, perms=_perms("dist"))
    assert client.get("/api/dist/tree", headers=headers).status_code == 200
    assert client.post("/api/dist/tree", headers=headers).status_code == 403
    assert client.delete("/api/dist/batches/20261123_040000", headers=headers).status_code == 403


def test_admin_can_write(client: TestClient, secret: str) -> None:
    for method in ("post", "put", "delete"):
        resp = client.request(method, "/api/demo", headers=_auth(secret, "admin"))
        assert resp.status_code == 200, method


def test_write_exempt_lets_viewer_change_own_password(client: TestClient, secret: str) -> None:
    """改自己密码豁免写规则（PUT /api/auth/me/password，最小 app 未定义路由）。"""
    assert client.put("/api/auth/me/password", headers=_auth(secret)).status_code == 404


def test_viewer_without_perm_locked_out(client: TestClient, secret: str) -> None:
    """无任何权限的 viewer：仅 /api/auth* 自助可用，其余一律 403。"""
    assert client.get("/api/auth/me", headers=_auth(secret)).status_code == 404
    resp = client.get("/api/dist/tree", headers=_auth(secret))
    assert resp.status_code == 403
    assert "权限不足" in resp.json()["detail"]
    assert client.get("/api/resources/mount", headers=_auth(secret)).status_code == 403


def test_viewer_with_dist_perm(client: TestClient, secret: str) -> None:
    """dist 权限：补丁下载端点可用，资源端点仍 403。"""
    headers = _auth(secret, perms=_perms("dist"))
    assert client.get("/api/dist/tree", headers=headers).status_code == 200
    assert client.get("/api/resources/mount", headers=headers).status_code == 403
    assert client.get("/api/preview/icon/inv_check", headers=headers).status_code == 403


def test_viewer_with_mount_perm_only(client: TestClient, secret: str) -> None:
    """mount 权限：坐骑资源与预览可用，宠物/补丁下载不可用。"""
    headers = _auth(secret, perms=_perms("mount"))
    assert client.get("/api/resources/mount", headers=headers).status_code == 200
    assert (
        client.get("/api/resources/mount/42/relationships", headers=headers).status_code == 200
    )
    assert client.get("/api/preview/icon/inv_check", headers=headers).status_code == 200
    assert client.get("/api/resources/pet", headers=headers).status_code == 403
    assert client.get("/api/dist/tree", headers=headers).status_code == 403
    assert client.get("/api/demo", headers=headers).status_code == 403


def test_viewer_with_all_resource_perms_sees_types(client: TestClient, secret: str) -> None:
    """三类型权限齐备：mount/pet/npc 全通。"""
    headers = _auth(secret, perms=_perms("mount", "pet", "npc"))
    for code in ("mount", "pet", "npc"):
        assert client.get(f"/api/resources/{code}", headers=headers).status_code == 200, code


def test_admin_access_everywhere(client: TestClient, secret: str) -> None:
    """admin 不受权限路由限制。"""
    assert client.get("/api/dist/tree", headers=_auth(secret, "admin")).status_code == 200
    assert client.get("/api/demo", headers=_auth(secret, "admin")).status_code == 200
    assert client.get("/api/resources/pet", headers=_auth(secret, "admin")).status_code == 200


def test_query_param_token_fallback(client: TestClient, secret: str) -> None:
    """浏览器 <a href> 下载带不了 Header，?token= 兜底鉴权。"""
    token = _token(secret, "viewer", _perms("dist"))
    assert client.get(f"/api/dist/download/20261123_040000/patch-zhCN-6.mpq?token={token}").status_code == 200
    assert (
        client.get("/api/dist/download/x.mpq", params={"token": "not-a-jwt"}).status_code == 401
    )


def test_header_token_takes_precedence_over_query(client: TestClient, secret: str) -> None:
    """Authorization 头优先于 ?token=：坏查询参数不干扰合法头。"""
    headers = _auth(secret, "admin")
    resp = client.get("/api/demo?token=garbage", headers=headers)
    assert resp.status_code == 200
