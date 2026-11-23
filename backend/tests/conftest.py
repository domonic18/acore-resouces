"""全局测试配置。

autouse：默认旁路 app.main 的 AuthMiddleware——集成测试不带令牌；鉴权自身的
放行/401/403 规则由 tests/unit/test_auth_middleware.py 用独立最小应用直测。
"""

from __future__ import annotations

import pytest

from app.core.security import AuthMiddleware


@pytest.fixture(autouse=True)
def _disable_auth_middleware():
    from app.main import app

    original = list(app.user_middleware)
    app.user_middleware = [m for m in original if m.cls is not AuthMiddleware]
    app.middleware_stack = app.build_middleware_stack()
    yield
    app.user_middleware = original
    app.middleware_stack = app.build_middleware_stack()
