# DBC 维护职责迁移与同步方案

## 背景与问题

当前项目中：

- `/Users/deadwalk/Code/acore-resouces` 是资源管理系统，维护坐骑 / 宠物 / NPC 的 YAML 元数据，并计划生成 DBC/SQL 补丁。
- `/Users/deadwalk/Workspace/acore-deploy` 是 AzerothCore 部署项目，目前通过 `wow-dbc/` 子模块维护原始 `.dbc` 文件，并通过 `scripts/acore-update-dbc.sh` 同步到 `data/dbc/`。
- `https://github.com/domonic18/wow-dbc.git` 是原始 DBC 仓库。

问题：`acore-deploy` 作为部署脚本仓库，不应该承担原始 DBC 文件维护职责。DBC 编辑应该与资源编辑在同一项目（`acore-resouces`）中完成，`acore-deploy` 只作为最终消费方，通过脚本或 skill 进行文件同步部署。

## 目标

1. 将原始 DBC 文件的唯一真相源从 `acore-deploy` 迁移到 `acore-resouces`。
2. 保持 `acore-deploy` 为纯部署消费方，不维护 DBC 源文件。
3. 在 `acore-resouces` 中提供 DBC 编辑、补丁生成、向 `acore-deploy` 同步的完整工作流。
4. 输出一份可落地的维护方案文档到 `docs/` 目录。

## 推荐方案

### 1. 目录与仓库职责划分

```text
acore-resouces/                          # 资源与 DBC 编辑主仓库
├── data/
│   ├── resources/          # 坐骑/宠物/NPC YAML（已有）
│   ├── mapping/            # 字段映射（已有）
│   ├── schemas/            # JSON Schema（已有）
│   └── wow-dbc/            # NEW: wow-dbc 子模块，原始 DBC 真相源
│       └── src/dbc/*.dbc
├── tools/
│   ├── wow-dbc-tool/       # 已有：DBC 读写 CLI 工具
│   └── wow-mpq-cli/        # 已有：MPQ 打包 CLI 工具
├── backend/app/exporters/  # NEW: DBC/SQL 补丁生成器
├── backend/app/cli/        # 已有：新增 export / dbc / deploy 命令组
├── patches/                # NEW: 生成的 DBC/SQL 补丁脚本
└── docs/                   # 维护方案文档

acore-deploy/               # 纯部署仓库
├── scripts/
│   └── acore-update-dbc.sh # 已有，改为从 acore-resouces 同步
├── data/dbc/               # 运行时 DBC（忽略，仅同步后使用）
└── configs/dbc-version.json# 同步版本记录
```

### 2. 为什么把 wow-dbc 子模块放在 `data/wow-dbc`

- DBC 是原始数据，不是可执行工具，放在 `data/` 语义正确。
- `tools/` 已用于 `wow-dbc-tool`、`wow-mpq-cli` 等可执行子模块。
- `sources/` 已在 `.gitignore` 中，不适合放需要版本控制的子模块。
- `data/wow-dbc/src/dbc/*.dbc` 与 `acore-update-dbc.sh --local-path` 的目录结构自然对齐。

### 3. 新增 CLI 命令组

在 `backend/app/cli/main.py` 注册三个新命令组：

#### `export` 组（仅生成补丁，不直接改 DBC）

| 命令 | 用途 |
|---|---|
| `export dbc --type mount --id 3 --output patches/mount_0003_dbc.py` | 生成修改 DBC 的 Python 脚本 |
| `export dbc --type mount --since-tag v1.0.0` | 批量生成自某 tag 以来的 DBC 补丁 |
| `export sql --type mount --id 3 --output patches/mount_0003_db.sql` | 生成 AzerothCore SQL 补丁 |
| `export all --since-tag v1.0.0 --output-dir patches/` | 一键生成 DBC + SQL 补丁 |

#### `dbc` 组（子模块管理）

| 命令 | 用途 |
|---|---|
| `dbc status` | 查看 `data/wow-dbc` 子模块 commit/branch/dirty 状态 |
| `dbc pull` | 更新子模块到远程最新 |
| `dbc diff` | 查看已修改的 DBC 文件摘要 |

#### `deploy` 组（同步到 acore-deploy）

| 命令 | 用途 |
|---|---|
| `deploy sync-dbc [--deploy-path PATH] [--dry-run] [--yes]` | 调用 `acore-update-dbc.sh --local-path data/wow-dbc/src/dbc` |

`deploy-path` 解析优先级：
1. CLI 参数 `--deploy-path`
2. 环境变量 `ACORE_DEPLOY_PATH`
3. 默认值：`../acore-deploy`（相对项目根目录）

### 4. 推荐工作流

```text
1. 在 acore-resouces 中编辑资源 YAML 或使用 /fix-mount-data、/mount-config skill。
2. 校验：uv run python -m app.cli resource validate --type mount --id 3
3. 导出 DBC 补丁：uv run python -m app.cli export dbc --type mount --id 3 --output patches/mount_0003_dbc.py
4. 导出 SQL 补丁：uv run python -m app.cli export sql --type mount --id 3 --output patches/mount_0003_db.sql
5. 人工审查 patches/ 下生成的脚本。
6. 应用 DBC 补丁：uv run python patches/mount_0003_dbc.py
7. 提交 data/wow-dbc 子模块变更。
8. 同步到 acore-deploy：uv run python -m app.cli deploy sync-dbc --yes
9. 在 acore-deploy 中重启 worldserver 验证。
```

### 5. `patches/` 目录作用与使用流程

`patches/` 是 **生成的、可审查的、可重放的 DBC/SQL 补丁脚本存放目录**。

#### 定位

- 它不是最终真相源：真相源是 `data/resources/*.yaml` 和 `data/wow-dbc/src/dbc/*.dbc`。
- 它是中间产物：把 YAML 中的资源变更，转换为可执行的 `wow-dbc-tool` Python 脚本或 `.sql` 文件。
- 它应当纳入 Git：方便代码审查、回滚、追溯某次资源变更对应的 DBC/SQL 操作。

#### 目录内容示例

```text
patches/
├── mount_0003_dbc.py          # 单个坐骑的 DBC 修改脚本
├── mount_0003_db.sql          # 单个坐骑的数据库 SQL 补丁
├── mounts_since_v1.0.0_dbc.py # 批量 DBC 修改脚本
└── README.md                  # 说明文件
```

#### 典型使用流程

1. **生成**：通过 `export dbc/sql` 命令从 YAML 资源生成。
2. **审查**：人工打开 `.py` 或 `.sql` 文件，确认修改的 ID、字段值正确。
3. **应用 DBC**：
   ```bash
   uv run python patches/mount_0003_dbc.py
   ```
   这会调用 `wow-dbc-tool` 修改 `data/wow-dbc/src/dbc/*.dbc`。
4. **应用 SQL**：
   ```bash
   /Users/deadwalk/Workspace/acore-deploy/scripts/acore-update-db.sh \
     --sql-file patches/mount_0003_db.sql --database acore_world
   ```
5. **提交**：把 `patches/` 下新增/修改的脚本与 `data/wow-dbc` 子模块一起提交。
6. **清理（可选）**：稳定运行后，可将过期补丁归档或删除；新的变更重新生成即可。

#### 与 Agent 的关系

- Agent **只生成** `patches/` 脚本，**不直接执行** DBC/SQL 写入。
- 应用脚本、同步部署需要人工确认或显式 `--yes` 参数。

### 6. acore-deploy 侧改动

`acore-deploy` 不再维护 DBC 源文件，仅作为部署消费方。

- **移除 `wow-dbc/` 子模块**：
  ```bash
  git submodule deinit -f wow-dbc
  git rm -f wow-dbc
  rm -rf .git/modules/wow-dbc
  ```
- `README.md`：说明 DBC 真相源已迁移到 `acore-resouces/data/wow-dbc`，展示推荐同步命令。
- `scripts/acore-update-dbc.sh`：帮助文本中增加 `--local-path /path/to/acore-resouces/data/wow-dbc/src/dbc` 示例。
- `.env.example`：增加 `WOW_DBC=/Users/deadwalk/Code/acore-resouces/data/wow-dbc/src/dbc` 示例。
- `docker-compose*.yml`（如需要）：确保 `data/dbc/` 挂载不变。

### 7. 关键实现文件

| 文件 | 用途 |
|---|---|
| `backend/pyproject.toml` | 增加 `wow-dbc-tool @ file:./tools/wow-dbc-tool` 路径依赖 |
| `backend/app/cli/main.py` | 注册 `export`、`dbc`、`deploy` 命令组 |
| `backend/app/cli/export.py` | `export dbc` / `export sql` / `export all` |
| `backend/app/cli/dbc.py` | `dbc status` / `dbc pull` / `dbc diff` |
| `backend/app/cli/deploy.py` | `deploy sync-dbc` |
| `backend/app/exporters/common.py` | 字段映射加载、tag diff 辅助 |
| `backend/app/exporters/dbc.py` | 生成 wow-dbc-tool Python 补丁脚本 |
| `backend/app/exporters/sql.py` | 生成 AzerothCore SQL 补丁 |
| `data/mapping/dbc_field_mapping.yaml` | YAML 语义字段 ↔ wow-dbc-tool 物理字段映射 |
| `patches/README.md` | 说明补丁脚本用途与提交流程 |
| `docs/arch/07DBC维护与同步方案.md` | 本方案文档 |

## 实施步骤

### 第一阶段：文档与架构确认（本次输出）

1. 创建 `docs/arch/07DBC维护与同步方案.md`，包含本方案全部内容。
2. 更新 `docs/README.md` 索引。
3. 不修改代码，仅输出方案供评审。

### 第二阶段：子模块与依赖落地

1. `git submodule add https://github.com/domonic18/wow-dbc.git data/wow-dbc`
2. `git submodule update --init --recursive data/wow-dbc`
3. 在 `backend/pyproject.toml` 增加 `wow-dbc-tool` 路径依赖。
4. `uv sync` 验证导入。
5. 创建 `patches/` 目录与 `patches/README.md`。

### 第三阶段：导出器引擎

1. 创建 `data/mapping/dbc_field_mapping.yaml`。
2. 实现 `backend/app/exporters/common.py`。
3. 实现 `backend/app/exporters/dbc.py`。
4. 实现 `backend/app/exporters/sql.py`。

### 第四阶段：CLI 命令

1. 实现 `backend/app/cli/export.py`。
2. 实现 `backend/app/cli/dbc.py`。
3. 实现 `backend/app/cli/deploy.py`。
4. 在 `backend/app/cli/main.py` 注册。

### 第五阶段：acore-deploy 侧适配

1. **移除 `wow-dbc/` 子模块**：
   ```bash
   git submodule deinit -f wow-dbc
   git rm -f wow-dbc
   rm -rf .git/modules/wow-dbc
   ```
2. 更新 `README.md`。
3. 更新 `scripts/acore-update-dbc.sh` 帮助文本。
4. 更新 `.env.example`。

### 第六阶段：测试与验证

1. 单元测试：字段映射、DBC 导出器、SQL 导出器。
2. 集成测试：`deploy sync-dbc --dry-run` 调用参数。
3. `uv run mypy app/`、`uv run ruff check --fix app/`、`uv run pytest`。
4. 端到端验证：导出 → 应用 → 同步 → 对比 `acore-deploy/data/dbc/`。

## 验证清单

- [ ] `data/wow-dbc/src/dbc/Spell.dbc` 存在。
- [ ] `export dbc --type mount --id 3` 成功生成可审查的 Python 脚本。
- [ ] 运行生成的脚本后，`dbc diff` 能显示变更。
- [ ] `deploy sync-dbc --dry-run` 正确指向 `acore-deploy/data/dbc/`。
- [ ] `deploy sync-dbc --yes` 同步文件并更新 `acore-deploy/configs/dbc-version.json`。
- [ ] 类型检查与测试通过。

## 安全约束

- Agent **不直接修改** `data/wow-dbc/src/dbc/*.dbc`，只生成 `patches/` 脚本。
- DBC 脚本应用、子模块提交、部署同步均需人工确认或显式 `--yes` 参数。
- 子模块更新提交使用 `chore(dbc): update data/wow-dbc submodule to <short-sha>`。

## 与现有 skill 的关系

- `/fix-mount-data`：继续补全 YAML 官方数据，完成后可接 `export dbc/sql`。
- `/mount-config`：继续指导 Spell.dbc 字段配置，完成后可接 `export dbc`。
- 新增 skill（可选）：`/sync-dbc` 一键执行 `deploy sync-dbc --dry-run` / `--yes`。
