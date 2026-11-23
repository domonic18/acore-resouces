# acore-resouces Backend - Claude Code AI 上下文文件

> 本目录下的规则是对项目根目录 [CLAUDE.md](../CLAUDE.md) 通用规则的补充。请先阅读根目录的通用规则。

## 1. 技术栈

- **Python**: 3.11+
- **包管理**: `uv`（统一使用，不是 python/python3/pip）
- **Web 框架**: FastAPI 0.110+ / Uvicorn
- **ORM**: SQLAlchemy 2.0+
- **数据验证**: Pydantic 2.5+ / Pydantic Settings
- **CLI**: Typer 0.12+
- **测试**: pytest
- **运行时数据**: SQLite（位于 `workspace/data/`）

## 2. Python 编码规范

### 类型提示（必需）

- **始终**为函数参数和返回值使用类型提示。
- 对复杂类型使用 `from typing import`。
- 优先使用 `T | None` 语法（Python 3.11+）。
- 对数据结构使用 Pydantic 模型。

```python
# 良好示例
from typing import Optional, List, Dict, Any

def get_mount_by_id(
    mount_id: int,
    include_dbc: bool = True
) -> Mount | None:
    """根据 ID 获取坐骑资源。"""
    pass
```

### 命名约定

| 类型 | 规范 | 示例 |
|------|------|------|
| 类 | PascalCase | `ResourceStore`, `MountSchema` |
| 函数/方法 | snake_case | `load_resource`, `sync_to_sqlite` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_PAGE_SIZE` |
| 私有方法 | 前导下划线 | `_validate_input` |
| Pydantic 模型 | PascalCase | `MountResponse` |
| 数据库模型 | PascalCase | `Mount`, `Pet`, `Npc` |
| API 端点 | snake_case | `get_mount` |

### 文档要求

- 每个模块需要文档字符串。
- 每个公共函数需要文档字符串。
- 使用 Google 风格的文档字符串。

```python
def resolve_texture_files(
    model_folder: str,
    texture_variations: list[str | None]
) -> list[Path]:
    """根据模型文件夹和贴图变体名称解析本地 .blp 文件路径。

    Args:
        model_folder: 资源模型目录名。
        texture_variations: 贴图变体名称列表。

    Returns:
        匹配到的 .blp 文件路径列表。
    """
    pass
```

## 3. 架构规范

### 薄路由、重服务的分层架构

- 路由层只处理 HTTP 逻辑（参数验证、响应格式、状态码、异常转换）。
- 业务逻辑在服务层实现。
- 正确使用 HTTP 状态码。
- 使用一致的 JSON 响应格式。
- 列表端点支持分页。

### 数据存储分层

- **YAML/JSON 文件**（`data/resources/`）：资源定义主存储，纳入 Git。
- **SQLite**（`workspace/data/acore_resource.db`）：运行时查询缓存，不入 Git。
- **原始资源**（`sources/`）：`.m2`/`.blp`/`.png`/`.gif`，不入 Git。
- **运行时缓存**（`workspace/assets/`）：缩略图，不入 Git。
- **运行时日志**（`workspace/logs/`）：应用日志，不入 Git。

### 状态管理

- YAML 文件是资源定义的唯一真相来源。
- SQLite 在启动/变更时从 YAML 同步，仅用于运行时查询和筛选。
- `registry.json` 由系统同步生成，Agent 不直接修改。

## 4. 开发工具链

**统一使用 `uv`（不是 python/python3/pip）**：

```bash
# 安装/同步依赖
uv sync

# 运行 FastAPI 服务
uv run uvicorn app.main:app --reload --port 8000

# 运行 CLI
uv run python -m app.cli resource list --type mount

# 运行测试
uv run pytest
uv run pytest -xvs tests/unit/test_validators.py

# 类型检查
uv run mypy app/

# 代码格式化
uv run ruff check --fix app/
uv run ruff format app/

# 添加依赖
uv add <package>

# 添加开发依赖
uv add --group dev <package>
```

## 5. 测试规范

测试框架 pytest，用例位于 `backend/tests/`（`unit/` + `integration/`）：
`uv run pytest`，单个用例 `uv run pytest -xvs tests/unit/test_validators.py`。

## 6. 鉴权与分发（账号中心：自建账号 + 委托验证 + 玩家下载）

- **账号来源**：本系统自建账号（SQLite `local_user` 表 + bcrypt 哈希），资源系统是
  唯一账号中心；`POST /api/auth/verify` 提供委托验证（`X-Delegation-Key` 恒时比较）
  供外部系统共用同一套账号，本系统对游戏主站/MySQL 零依赖。
- **首次启动**：`local_user` 表为空且配置了 `AUTH_BOOTSTRAP_ADMIN_PASSWORD` 时，
  自动创建 `admin` 账号；表空且未配置时登录接口返回明确的配置错误提示。
- **`.env` 必填项**：`AUTH_JWT_SECRET`（≥32 字节随机）；可选项
  `AUTH_BOOTSTRAP_ADMIN_PASSWORD`（仅首启建 admin）、`AUTH_DELEGATION_KEY`
  （为空时 verify 端点整体禁用）。缺失必填项时接口明确报错，绝不硬编码兜底。
- **角色规则**：两级角色 admin/viewer 存在 `local_user.role`，viewer 即玩家；
  管理员可在「账号权限」页创建账号、改角色、重置密码、删除（不可操作自己）。
- **查看权限**：权限码 `PERMISSION_CODES = ("dist", "mount", "pet", "npc")` 存
  `local_user.permissions`（JSON 数字符串）；admin 隐式全量（存储值被忽略），权限仅对
  viewer 生效。登录时写入 JWT claim `perms`，中间件按前缀路由：`/api/auth*` 恒通、
  `/api/dist*` 需 dist、`/api/resources/{mount|pet|npc}*` 需对应权限（list/detail/
  relationships/flow/assets 全覆盖）、`/api/preview*` 任一资源权限即可（图标/缩略图跨
  类型共用，松散门控——决策已确认）；其余路径（dbc/mpq/patches/settings/system/
  wowhead/files）仅 admin。旧 token 无 `perms` claim 视为空权限，重新登录即恢复。
  存量库无 `permissions` 列时 `_ensure_local_table()` 自动 ALTER，存量 viewer 默认
  `["dist"]`（行为与权限系统上线前一致）。写权限不依赖此模型：非 GET 仅 admin 规则照旧。
- **端点**（`api/auth.py`）：`/login`、`/verify` 为公开端点（verify 路由内自校验
  委托密钥）；`/accounts` 系列仅 admin（`PUT /accounts/{id}/permissions` 校验
  ⊆ PERMISSION_CODES）；`PUT /api/auth/me/password` 仅需登录
  （在 `WRITE_EXEMPTS` 豁免，bootstrap admin 的首次改密入口）。
- **中间件**（`app/core/security.py`）：只拦 `/api/*`；放行 `OPTIONS`、公开端点；
  token 取 `Authorization: Bearer` 头，缺失时兜底 `?token=` 查询参数
  （浏览器 `<a href>`/`<img src>` 下载带不了 Header；权衡：token 会进访问日志，
  仅用于下载/图片链接）；viewer 走 `_viewer_permitted` 前缀权限路由（见「查看权限」），
  未命中一律 403「权限不足：当前账号无权访问该内容」；GET 仅需登录；非 GET 默认 admin
  （豁免清单 `WRITE_EXEMPTS`：wowhead 搜索、AI 连通性测试、改自己密码）。
  **必须在 CORS 之前 `add_middleware`**，让 CORS 保持最外层（Starlette 后加者在最外层）。
- **补丁分发**（`services/dist_site.py` + `api/dist.py`）：发布即上架——`publish`
  把 MPQ 移入 `workspace/dist/{批次}/` 并写 manifest 补丁编号，`GET /api/dist/tree`
  即列出该批次；下载走 `GET /api/dist/download/{path}`（resolve 后限 dist 目录、
  仅 `.mpq`、`FileResponse` 附件下载）。管理操作（批次列表/改公告/下线）要求 admin。
- **测试**：`tests/conftest.py` 的 autouse fixture 会剥离 AuthMiddleware，
  中间件行为由 `tests/unit/test_auth_middleware.py` 单独用最小 app 覆盖。

## 7. 任务完成后检查清单

完成后端编码任务后：

1. **类型安全**：`uv run mypy app/`
2. **测试**：`uv run pytest`
3. **代码质量**：`uv run ruff check --fix app/` + `uv run ruff format app/`
4. **验证**：API 端点的输入验证和错误处理
5. **文档**：确保代码注释和文档字符串保持最新
