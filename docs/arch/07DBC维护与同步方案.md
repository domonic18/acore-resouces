# DBC 维护职责迁移与同步方案

> **状态**：方案已落地。`patch export` / `patch build` / `patch publish` 三段式工作流已实现；`dbc` 与 `deploy` 命令组尚未在 CLI 中暴露（见第六节待办）。

## 一、背景与问题

历史项目中：

- `acore-resouces` 是资源管理系统，维护坐骑 / 宠物 / NPC 的 YAML 元数据，并生成 DBC/SQL 补丁。
- `acore-deploy` 是 AzerothCore 部署项目，曾通过 `wow-dbc/` 子模块维护原始 `.dbc` 文件，并通过 `scripts/acore-update-dbc.sh` 同步到 `data/dbc/`。
- `https://github.com/domonic18/wow-dbc.git` 是原始 DBC 仓库。

原始问题：`acore-deploy` 作为部署脚本仓库，不应该承担原始 DBC 文件维护职责。DBC 编辑应该与资源编辑在同一项目（`acore-resouces`）中完成，`acore-deploy` 只作为最终消费方。

## 二、目标

1. ✅ 将原始 DBC 文件的唯一真相源从 `acore-deploy` 迁移到 `acore-resouces/data/wow-dbc` 子模块。
2. ✅ 保持 `acore-deploy` 为纯部署消费方，不再维护 DBC 源文件。
3. ✅ 在 `acore-resouces` 中提供 DBC 编辑、补丁生成、向 `acore-deploy` 同步的完整工作流。
4. ✅ 输出可落地的维护方案文档到 `docs/arch/` 目录。

## 三、目录与仓库职责划分

```text
acore-resouces/                          # 资源与 DBC 编辑主仓库
├── data/
│   ├── resources/          # 坐骑/宠物/NPC YAML（真相源之一）
│   ├── mapping/            # 字段映射
│   ├── schemas/            # JSON Schema
│   ├── wow-dbc/            # ✅ wow-dbc 子模块：原始 DBC 真相源
│   │   └── src/dbc/*.dbc
│   └── sql/
│       └── azerothcore-updates/  # ✅ 软链接 → ${ACORE_SQL_UPDATES_DIR}
├── tools/
│   ├── wow-dbc-tool/       # 已有：DBC 读写 CLI 工具（子模块）
│   └── wow-mpq-cli/        # 已有：MPQ 打包 CLI 工具（子模块）
├── backend/app/
│   ├── services/
│   │   ├── patch_exporter.py       # ✅ 原料包生成
│   │   ├── mount_patch_builder.py  # ✅ DBC/SQL/MPQ 构建
│   │   └── patch_publisher.py      # ✅ MPQ 发布
│   └── cli/patch.py        # ✅ patch export/build/publish/list/get/update
├── workspace/
│   ├── patch-jobs/{job_id}/        # 运行时补丁任务（不入 Git）
│   ├── mpq/{timestamp}/            # 批次 MPQ 输出
│   ├── dist/{timestamp}/           # 发布后的 MPQ（连续编号）
│   └── reports/{timestamp}.json    # 批次校验报告
└── docs/arch/              # 维护方案文档

acore-deploy/               # 纯部署仓库
├── scripts/acore-update-dbc.sh   # 从 acore-resouces 同步
├── data/dbc/                     # 运行时 DBC（同步后使用）
└── configs/dbc-version.json      # 同步版本记录
```

### 3.1 为什么把 wow-dbc 子模块放在 `data/wow-dbc`

- DBC 是原始数据，不是可执行工具，放在 `data/` 语义正确。
- `tools/` 用于 `wow-dbc-tool`、`wow-mpq-cli` 等可执行子模块。
- `sources/` 已在 `.gitignore` 中，不适合放需要版本控制的子模块。
- `data/wow-dbc/src/dbc/*.dbc` 与 `acore-update-dbc.sh --local-path` 的目录结构自然对齐。

### 3.2 SQL 软链接机制

`data/sql/azerothcore-updates` 是一个软链接，指向 AzerothCore 部署目录下的世界数据库更新目录：

```bash
# 当前实例
data/sql/azerothcore-updates → /Users/deadwalk/Code/azerothcore-wotlk/modules/mod-custom-content/data/sql/db-world/updates
```

- 由 `ACORE_SQL_UPDATES_DIR` 环境变量配置（默认值见 `backend/app/config.py`）。
- `patch build` 生成的 `db_patch.sql` 会被**追加写入**此目录下的 `patch_world.sql`，AzerothCore 重启时自动加载。
- 软链接断开时 `patch build` 会跳过 SQL 同步并记录 warning，但 DBC/MPQ 产物仍正常输出。

## 四、CLI 命令：`patch` 组（已实现）

所有命令通过 Typer 注册在 `backend/app/cli/patch.py`，统一入口：

```bash
uv run --project backend python -m app.cli patch <command> [options]
```

| 命令 | 用途 | 关键参数 |
|------|------|---------|
| `patch export` | 为单个资源生成补丁原料包 | `--type`、`--id` |
| `patch build` | 批量构建 DBC/SQL/MPQ | `--all-requested` 或 `--jobs` 多次；`--dry-run` |
| `patch publish` | 发布 MPQ 到 `workspace/dist/` | `--start-number`、`--dry-run` |
| `patch list` | 分页列出补丁任务 | `--status`、`--type`、`--limit` |
| `patch get` | 查看单个补丁任务详情 | `{job_id}` |
| `patch update` | 更新任务状态 | `{job_id}`、`{status}` |

> `job_id` 当前实现为 `{resource_type}_{id:04d}`（如 `mount_0003`），不再带时间戳，便于幂等重跑。

### 4.1 推荐工作流

```bash
# 1. 校验资源
uv run --project backend python -m app.cli resource validate --type mount --id 3

# 2. 导出补丁原料包
uv run --project backend python -m app.cli patch export --type mount --id 3

# 3. 批量构建（处理所有 requested 状态的任务）
uv run --project backend python -m app.cli patch build --all-requested

# 或指定任务 ID
uv run --project backend python -m app.cli patch build --jobs mount_0003 --jobs mount_0004

# 仅校验冲突，不修改文件
uv run --project backend python -m app.cli patch build --all-requested --dry-run

# 4. 发布到 workspace/dist/
uv run --project backend python -m app.cli patch publish --start-number 5

# 5. 同步到 acore-deploy（人工执行）
# - DBC：bash acore-deploy/scripts/acore-update-dbc.sh --local-path data/wow-dbc/src/dbc
# - SQL：通过软链接已自动同步，重启 worldserver 即可加载
# - MPQ：人工拷贝 workspace/dist/{timestamp}/patch-zhCN-*.mpq 到客户端 Data/
```

## 五、`workspace/patch-jobs/` 目录结构

`workspace/patch-jobs/` 是 **按任务隔离的补丁原料与产物目录**，每个资源导出请求生成一个独立子目录。

### 5.1 定位

- 它不是最终真相源：真相源是 `data/resources/*.yaml` 和 `data/wow-dbc/src/dbc/*.dbc`。
- 它是运行时工作区：系统在此存放原料包，`patch build` 在此产出最终 DBC/SQL/MPQ。
- 它**不入 Git**：属于运行时产物，可由 `manifest.json` 追溯历史。

### 5.2 目录内容示例

```text
workspace/patch-jobs/mount_0003/
├── manifest.json              # 任务元数据、状态、产物路径
├── input/                     # patch export 生成
│   ├── resource.yaml          # 资源 YAML 快照
│   ├── assets.json            # 模型/贴图/图标文件清单
│   ├── dbc-plan.yaml          # 每个 DBC 文件的 add/edit 操作
│   ├── sql-plan.yaml          # 目标表与记录
│   └── README.md              # 给 Skill / 人工的说明
└── output/                    # patch build 生成
    ├── dbc/                   # 修改后的 *.dbc
    ├── db_patch.sql           # AzerothCore SQL 补丁（已追加到 azerothcore-updates）
    └── patch-mount-0003.mpq   # 客户端 MPQ（位于 workspace/mpq/{batch}/）
```

### 5.3 与 Agent 的关系

- Agent/Web 系统**只生成原料包**到 `workspace/patch-jobs/{job_id}/input/`。
- `patch build` 负责调用 `wow-dbc-tool` / `wow-mpq-cli` 生成最终产物。
- 应用 DBC/SQL、同步部署需要人工确认或显式参数。

## 六、尚未实现：`dbc` 与 `deploy` 命令组（规划中）

`backend/app/cli/` 当前仅注册了 `patch` 命令组。以下两组尚未落地，使用时通过手工命令替代。

### 6.1 `dbc` 组（子模块管理）

| 命令 | 用途 | 当前替代方式 |
|------|------|------------|
| `dbc status` | 查看 `data/wow-dbc` 子模块状态 | `git submodule status data/wow-dbc` |
| `dbc pull` | 更新子模块到远程最新 | `git submodule update --remote data/wow-dbc` |
| `dbc diff` | 查看已修改的 DBC 文件摘要 | `git -C data/wow-dbc status -s` |

### 6.2 `deploy` 组（同步到 acore-deploy）

| 命令 | 用途 | 当前替代方式 |
|------|------|------------|
| `deploy sync-dbc [--dry-run] [--yes]` | 同步 DBC 到 acore-deploy | 手工执行 `acore-update-dbc.sh --local-path data/wow-dbc/src/dbc` |

`deploy-path` 解析优先级（待实现时的设计）：

1. CLI 参数 `--deploy-path`
2. 环境变量 `ACORE_DEPLOY_PATH`
3. 默认值：`../acore-deploy`（相对项目根目录）

## 七、关键实现文件

| 文件 | 用途 |
|------|------|
| `backend/app/services/patch_exporter.py` | 创建补丁任务目录、生成原料包、维护 manifest |
| `backend/app/services/mount_patch_builder.py` | 调用 `wow-dbc-tool` / `wow-mpq-cli` 构建 DBC/SQL/MPQ |
| `backend/app/services/patch_publisher.py` | 发布 MPQ 到 `workspace/dist/{timestamp}/` |
| `backend/app/api/patches.py` | REST API：`POST /api/patches/export-request`、`GET /api/patches` |
| `backend/app/cli/patch.py` | `patch export/build/publish/list/get/update` CLI |
| `backend/app/schemas/patch.py` | `PatchJob`、`PatchJobUpdateRequest` 等 Pydantic 模型 |
| `.claude/skills/build-mount-patch/SKILL.md` | Claude Skill：读取原料包生成最终 DBC/SQL/MPQ |
| `docs/arch/07DBC维护与同步方案.md` | 本方案文档 |

## 八、acore-deploy 侧适配

`acore-deploy` 不再维护 DBC 源文件，仅作为部署消费方：

- 移除 `wow-dbc/` 子模块（已执行）。
- `README.md`：说明 DBC 真相源已迁移到 `acore-resouces/data/wow-dbc`，展示推荐同步命令。
- `scripts/acore-update-dbc.sh`：帮助文本中增加 `--local-path /path/to/acore-resouces/data/wow-dbc/src/dbc` 示例。
- `.env.example`：增加 `WOW_DBC=/Users/deadwalk/Code/acore-resouces/data/wow-dbc/src/dbc` 示例。
- `docker-compose*.yml`：确保 `data/dbc/` 挂载不变。

## 九、安全约束

- Agent **不直接修改** `data/wow-dbc/src/dbc/*.dbc`，只生成 `workspace/patch-jobs/{job_id}/input/` 原料包。
- DBC/SQL/MPQ 最终产物由 `patch build` 在 `output/` 中生成；子模块提交、部署同步均需人工确认。
- 子模块更新提交使用 `chore(dbc): update data/wow-dbc submodule to <short-sha>`。
- `data/sql/azerothcore-updates` 是软链接，**禁止** 强制覆盖或删除；破坏后会影响 AzerothCore 部署。

## 十、验证清单

- [x] `data/wow-dbc/src/dbc/Spell.dbc` 存在。
- [x] `patch export --type mount --id 3` 成功生成原料包。
- [x] `patch build --jobs mount_0003` 成功生成 `output/dbc/`、`output/db_patch.sql`、`workspace/mpq/{batch}/patch-mount-0003.mpq`。
- [x] `patch publish --start-number N` 将 MPQ 复制到 `workspace/dist/{timestamp}/patch-zhCN-N.mpq`。
- [x] 类型检查与测试通过（`uv run mypy app/`、`uv run ruff check app/`、`uv run pytest`）。
- [ ] `dbc status/pull/diff` CLI 命令组（待实现，见第六节）。
- [ ] `deploy sync-dbc` CLI 命令组（待实现，见第六节）。

## 十一、与现有 Skill 的关系

| Skill | 触发时机 | 与 patch 工作流的关系 |
|-------|---------|---------------------|
| `enrich-mount-data` / `enrich-pet-data` | 缺失 Wowhead 官方字段 | 完成后可接 `patch export` |
| `configure-mount-spell` | 需要调整 Spell.dbc 字段 | 完成后可接 `patch export` |
| `build-mount-patch` | 已有原料包，需要生成最终产物 | 等价于 `patch build --jobs {job_id}` |
| `export-mount-jobs` | Web 端批量勾选坐骑导出 | 等价于多次 `patch export` |
| `publish-patch` | 将 `workspace/mpq/` 发布到 `workspace/dist/` | 等价于 `patch publish` |

## 十二、相关文档

| 文档 | 路径 |
|------|------|
| Agent 交互架构 | `docs/arch/03Agent交互架构.md` |
| 数据存储设计 | `docs/arch/02数据存储设计.md` |
| 整体架构设计 | `docs/arch/01整体架构设计.md` |
