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

详见：`docs/arch/05测试策略.md`

## 6. 任务完成后检查清单

完成后端编码任务后：

1. **类型安全**：`uv run mypy app/`
2. **测试**：`uv run pytest`
3. **代码质量**：`uv run ruff check --fix app/` + `uv run ruff format app/`
4. **验证**：API 端点的输入验证和错误处理
5. **文档**：确保代码注释和文档字符串保持最新
