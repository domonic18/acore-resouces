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
├── backend/app/exporters/  # DBC/SQL 补丁生成器（当前由 patch_exporter 服务实现）
├── backend/app/cli/        # 已有：新增 patch 命令组
├── workspace/patch-jobs/   # 运行时补丁任务目录（不入 Git）
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

#### `patch` 组（补丁任务管理）

| 命令 | 用途 |
|---|---|
| `patch export --type mount --id 3` | 为单个资源生成补丁任务原料包 |
| `patch list --status requested` | 列出补丁任务 |
| `patch get {job_id}` | 查看单个补丁任务详情 |
| `patch update {job_id} generated` | 更新补丁任务状态 |

Claude Skill `/build-mount-patch` 读取原料包后生成最终 `.sql`、`.dbc`、`.mpq` 产物。

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
1. 在 acore-resouces 中编辑资源 YAML 或使用 `/enrich-mount-data`、`/configure-mount-spell` skill。
2. 校验：`uv run python -m app.cli resource validate --type mount --id 3`
3. 导出补丁原料包：`uv run python -m app.cli patch export --type mount --id 3`
4. Claude Skill `/build-mount-patch {job_id}` 生成最终 DBC/SQL/MPQ 产物。
5. 人工审查 `workspace/patch-jobs/{job_id}/output/` 下产物。
6. 提交 `data/wow-dbc` 子模块变更。
7. 同步到 acore-deploy：`uv run python -m app.cli deploy sync-dbc --yes`
8. 在 acore-deploy 中重启 worldserver 验证。
```

### 5. `workspace/patch-jobs/` 目录作用与使用流程

`workspace/patch-jobs/` 是 **按任务隔离的补丁原料与产物目录**，每个资源导出请求生成一个独立子目录。

#### 定位

- 它不是最终真相源：真相源是 `data/resources/*.yaml` 和 `data/wow-dbc/src/dbc/*.dbc`。
- 它是运行时工作区：系统在此存放原料包，Claude Skill `/build-mount-patch` 在此产出最终 DBC/SQL/MPQ。
- 它**不入 Git**：属于运行时产物，可由 `manifest.json` 追溯历史。

#### 目录内容示例

```text
workspace/patch-jobs/
└── 20250724_143022_mount_0003_梦光符文牡鹿/
    ├── manifest.json              # 任务元数据与状态
    ├── input/                     # 系统生成的原料
    │   ├── resource.yaml
    │   ├── assets.json
    │   ├── dbc-plan.yaml
    │   ├── sql-plan.yaml
    │   └── README.md
    └── output/                    # Skill 生成的产物
        ├── dbc/
        │   ├── Spell.dbc
        │   ├── CreatureDisplayInfo.dbc
        │   └── ...
        ├── db_patch.sql
        └── patch-mount-0003.mpq
```

#### 典型使用流程

1. **生成原料**：Web 前端点击"导出补丁原料"或调用 `patch export`。
2. **生成产物**：Claude Skill `/build-mount-patch` 读取原料，调用外部工具生成产物。
3. **审查**：人工打开 `output/` 下文件，确认 ID、字段值正确。
4. **应用 DBC**：将 `output/dbc/*.dbc` 同步到 `acore-deploy/data/dbc/`。
5. **应用 SQL**：通过 `acore-update-db.sh` 执行 `output/db_patch.sql`。
6. **部署 MPQ**：将 `output/patch-mount-0003.mpq` 放入客户端 `Data/` 目录。

#### 与 Agent 的关系

- Agent/Web 系统**只生成原料包**到 `workspace/patch-jobs/{job_id}/input/`。
- Skill `/build-mount-patch` 负责生成最终产物。
- 应用 DBC/SQL、同步部署需要人工确认或显式 `--yes` 参数。

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
| `backend/app/services/patch_exporter.py` | 创建补丁任务目录、生成原料包、维护 manifest |
| `backend/app/api/patches.py` | REST API：`POST /api/patches/export-request` 等 |
| `backend/app/cli/patch.py` | `patch export/list/get/update` CLI 命令 |
| `.claude/skills/build-mount-patch/SKILL.md` | Claude Skill：读取原料包生成最终 DBC/SQL/MPQ |
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

### 第三阶段：补丁任务服务

1. 实现 `backend/app/services/patch_exporter.py`。
2. 实现 `backend/app/schemas/patch.py`。
3. 实现 `backend/app/api/patches.py`。
4. 实现 `backend/app/cli/patch.py`。

### 第四阶段：Claude Skill

1. 创建 `.claude/skills/build-mount-patch/SKILL.md`。
2. 配置 Skill 权限（`wow-dbc-tool`、`mpqcli`）。

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
- [ ] `patch export --type mount --id 3` 成功生成原料包。
- [ ] `/build-mount-patch {job_id}` 成功生成 `output/dbc/`、`output/db_patch.sql`、`output/patch-mount-0003.mpq`。
- [ ] `deploy sync-dbc --dry-run` 正确指向 `acore-deploy/data/dbc/`。
- [ ] `deploy sync-dbc --yes` 同步文件并更新 `acore-deploy/configs/dbc-version.json`。
- [ ] 类型检查与测试通过。

## 安全约束

- Agent **不直接修改** `data/wow-dbc/src/dbc/*.dbc`，只生成 `workspace/patch-jobs/{job_id}/input/` 原料包。
- DBC/SQL/MPQ 最终产物生成、子模块提交、部署同步均需人工确认或显式 `--yes` 参数。
- 子模块更新提交使用 `chore(dbc): update data/wow-dbc submodule to <short-sha>`。

## 与现有 skill 的关系

- `/enrich-mount-data`：继续补全 YAML 官方数据，完成后可接 `export dbc/sql`。
- `/configure-mount-spell`：继续指导 Spell.dbc 字段配置，完成后可接 `export dbc`。
- 新增 skill（可选）：`/sync-dbc` 一键执行 `deploy sync-dbc --dry-run` / `--yes`。
