# DBC 维护职责迁移与同步方案

> **状态**：方案已落地。`patch export` / `patch build` / `patch publish` 三段式工作流已实现（CLI 与 HTTP 端点双入口，Web 导出页 `/export` 提供全流程可视化）；`dbc` 与 `deploy` 命令组尚未在 CLI 中暴露（见第六节待办）。

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
│   │   ├── patch_exporter.py       # ✅ 补丁任务创建（写 job.json）
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
- `patch build` 生成的 SQL 会按坐骑写入此目录下的 `mounts/{id:04d}_{slug}/{id:04d}_mount_add.sql`（如需掉落另有 `{id:04d}_mount_loot.sql`），AzerothCore 重启时自动加载。
- 软链接断开时 `patch build` 会跳过 SQL 同步并记录 warning，但 DBC/MPQ 产物仍正常输出。

## 四、CLI 命令：`patch` 组（已实现）

所有命令通过 Typer 注册在 `backend/app/cli/patch.py`，统一入口：

```bash
uv run --project backend python -m app.cli patch <command> [options]
```

| 命令 | 用途 | 关键参数 |
|------|------|---------|
| `patch export` | 为单个资源创建补丁任务 | `--type`、`--id` |
| `patch build` | 批量构建 DBC/SQL/MPQ | `--all-requested` 或 `--jobs` 多次；`--dry-run`；`--force`（已存在 DBC 记录强制重写、SQL 跳过历史条目检查） |
| `patch publish` | 发布 MPQ 到 `workspace/dist/` | `--start-number`、`--dry-run` |
| `patch list` | 分页列出补丁任务 | `--status`、`--type`、`--limit` |
| `patch get` | 查看单个补丁任务详情 | `{job_id}` |
| `patch update` | 更新任务状态 | `{job_id}`、`{status}` |

> `job_id` 当前实现为 `{resource_type}_{id:04d}`（如 `mount_0003`），不再带时间戳，便于幂等重跑。

### 4.1 推荐工作流

```bash
# 1. 校验资源
uv run --project backend python -m app.cli resource validate --type mount --id 3

# 2. 创建补丁任务（仅写 job.json，资源以 data/resources/ 真相源为准）
uv run --project backend python -m app.cli patch export --type mount --id 3

# 3. 批量构建（处理所有 requested 状态的任务）
uv run --project backend python -m app.cli patch build --all-requested

# 或指定任务 ID
uv run --project backend python -m app.cli patch build --jobs mount_0003 --jobs mount_0004

# 仅校验冲突，现场生成的计划写入各任务 plans/ 子目录供审查
uv run --project backend python -m app.cli patch build --all-requested --dry-run

# 4. 发布到 workspace/dist/
uv run --project backend python -m app.cli patch publish --start-number 5

# 5. 同步到 acore-deploy（人工执行）
# - DBC：bash acore-deploy/scripts/acore-update-dbc.sh --local-path data/wow-dbc/src/dbc
# - SQL：通过软链接已自动同步，重启 worldserver 即可加载
# - MPQ：人工拷贝 workspace/dist/{timestamp}/patch-zhCN-*.mpq 到客户端 Data/
```

## 五、`workspace/patch-jobs/` 目录结构

`workspace/patch-jobs/` 是 **按任务隔离的补丁任务与产物目录**，每个资源导出请求生成一个独立子目录。

### 5.1 定位

- 它不是最终真相源：真相源是 `data/resources/*.yaml` 和 `data/wow-dbc/src/dbc/*.dbc`。
- 它是运行时工作区：`patch export` 只写入任务元数据 `job.json`；`patch build` 按 `job.json` 中的 `resource_id` 现场读取最新 YAML，在内存中生成 DBC/SQL 计划与资源清单（不落盘快照），产物写入各自目录。
- 它**不入 Git**：属于运行时产物，可由 `job.json` 追溯历史。

### 5.2 目录内容示例

```text
workspace/patch-jobs/mount_0003/
├── job.json                   # 任务元数据、状态、产物路径（patch export 仅写此文件）
└── plans/                     # 仅 patch build --dry-run 生成，供审查；正式 build 会清理
    ├── dbc-plan.yaml          # 现场生成的 DBC add/edit 计划
    ├── sql-plan.yaml          # 现场生成的目标表与记录
    └── assets.json            # 现场生成的模型/贴图/图标文件清单
```

### 5.3 与 Agent 的关系

- Agent/Web 系统**只创建补丁任务**（仅写 `workspace/patch-jobs/{job_id}/job.json`，资源以 `data/resources/` 真相源为准）。
- `patch build` 负责按 `job.json` 现场读取资源，调用 `wow-dbc-tool` / `wow-mpq-cli` 生成最终产物。
- 应用 DBC/SQL、同步部署需要人工确认或显式参数。

### 5.4 任务状态流转

状态存储在 `job.json` 的 `status` 字段（`backend/app/schemas/patch.py` 中 `PatchJobStatus`）：

```text
requested ──patch build──▶ generated ──人工应用 SQL/MPQ──▶ applied
    │       （成功）   │
    │                 └──构建失败──▶ failed
    └──构建失败──▶ failed
```

| 状态 | 触发时机 |
|------|---------|
| `requested` | `patch export` / Web 导出页创建任务后。 |
| `generated` | `patch build` 成功生成该任务的 DBC/SQL 产物后。 |
| `failed` | 构建过程出错（如 DBC 冲突、资源校验失败）后。 |
| `applied` | 人工将 SQL 应用到 `acore-world`、MPQ 放入客户端后手动标记（CLI `patch update` / Web 任务列表）。 |

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
| `backend/app/services/patch_exporter.py` | 创建补丁任务目录、写 `job.json` |
| `backend/app/services/mount_patch_builder.py` | 现场读取真相源构建 `JobContext`，调用 `wow-dbc-tool` / `wow-mpq-cli` 构建 DBC/SQL/MPQ |
| `backend/app/services/patch_publisher.py` | 发布 MPQ 到 `workspace/dist/{timestamp}/` |
| `backend/app/services/build_runner.py` | HTTP 侧构建运行器：线程锁串行化 + 状态查询（`POST /api/patches/build` 的后台执行体） |
| `backend/app/api/patches.py` | REST API：`POST /api/patches/export-request`、`GET /api/patches`、`POST /api/patches/build`、`GET /api/patches/build/status`、`POST /api/patches/publish`、`GET/PUT /api/patches/{job_id}` |
| `backend/app/cli/patch.py` | `patch export/build/publish/list/get/update` CLI |
| `backend/app/schemas/patch.py` | `PatchJob`、`PatchJobUpdateRequest` 等 Pydantic 模型 |
| `.claude/skills/build-mount-patch/SKILL.md` | Claude Skill：读取补丁任务（job.json + 真相源 YAML）生成最终 DBC/SQL/MPQ |
| `docs/arch/07DBC维护与同步方案.md` | 本方案文档 |

## 八、acore-deploy 侧适配

`acore-deploy` 不再维护 DBC 源文件，仅作为部署消费方：

- 移除 `wow-dbc/` 子模块（已执行）。
- `README.md`：说明 DBC 真相源已迁移到 `acore-resouces/data/wow-dbc`，展示推荐同步命令。
- `scripts/acore-update-dbc.sh`：帮助文本中增加 `--local-path /path/to/acore-resouces/data/wow-dbc/src/dbc` 示例。
- `.env.example`：增加 `WOW_DBC=/Users/deadwalk/Code/acore-resouces/data/wow-dbc/src/dbc` 示例。
- `docker-compose*.yml`：确保 `data/dbc/` 挂载不变。

## 九、安全约束

- Agent **不直接修改** `data/wow-dbc/src/dbc/*.dbc`，只创建 `workspace/patch-jobs/{job_id}/job.json` 补丁任务。
- DBC/SQL/MPQ 最终产物由 `patch build` 在 `output/` 中生成；子模块提交、部署同步均需人工确认。
- 子模块更新提交使用 `chore(dbc): update data/wow-dbc submodule to <short-sha>`。
- `data/sql/azerothcore-updates` 是软链接，**禁止** 强制覆盖或删除；破坏后会影响 AzerothCore 部署。

## 十、验证清单

- [x] `data/wow-dbc/src/dbc/Spell.dbc` 存在。
- [x] `patch export --type mount --id 3` 成功创建补丁任务（job.json）。
- [x] `patch build --jobs mount_0003` 成功编辑 `data/wow-dbc/src/dbc/`、生成 `data/sql/azerothcore-updates/mounts/0003_{slug}/` SQL、`workspace/mpq/{batch}/patch-mounts.mpq`。
- [x] `patch publish --start-number N` 将 MPQ 复制到 `workspace/dist/{timestamp}/patch-zhCN-N.mpq`。
- [x] 类型检查与测试通过（`uv run mypy app/`、`uv run ruff check app/`、`uv run pytest`）。
- [ ] `dbc status/pull/diff` CLI 命令组（待实现，见第六节）。
- [ ] `deploy sync-dbc` CLI 命令组（待实现，见第六节）。

## 十一、与现有 Skill 的关系

| Skill | 触发时机 | 与 patch 工作流的关系 |
|-------|---------|---------------------|
| `enrich-mount-data` / `enrich-pet-data` | 缺失 Wowhead 官方字段 | 完成后可接 `patch export` |
| `configure-mount-spell` | 需要调整 Spell.dbc 字段 | 完成后可接 `patch export` |
| `build-mount-patch` | 已有补丁任务，需要生成最终产物 | 等价于 `patch build --jobs {job_id}` |
| `export-mount-jobs` | Web 端批量勾选坐骑导出 | 等价于多次 `patch export` |
| `publish-patch` | 将 `workspace/mpq/` 发布到 `workspace/dist/` | 等价于 `patch publish` |

## 十二、规划：补丁产物审计记录 🚧

> 对应需求 v1.1 §3.7（补丁任务审查记录）。目标：字段级改动审计，让用户能逐项核对生成结果与预期。

### 12.1 数据源与可行性

审计数据**无需重新生成**——构建主流程内存中已持有字段级完整计划：

| 数据 | 来源 | 现状 |
|------|------|------|
| DBC 改动计划 | `ctx.dbc_plan`（`schemas/patch.py` `DBCPlan`/`DBCPlanFile`，operations 含 action/record_id/fields） | ✅ 字段级完整，dry-run 与正式构建同源 |
| SQL 改动计划 | `ctx.sql_plan`（`SQLPlan`/`SQLPlanTable`，表名+记录 dict） | ✅ 可直接还原"表+记录+字段"结构 |
| MPQ 文件清单 | `build_mpq` 返回的 `job_assets: dict[job_id, list[Path]]` | ⚠️ 内存可得但未持久化 |
| DBC before 值 | `apply_dbc_operations` 中读到 `existing` 记录 | ❌ 未捕获，需增加 `existing.to_dict()` 保留 |

### 12.2 产物设计

- **批次级审计文件**：`workspace/reports/{timestamp}/audit-report.json`，与 `validation-report.json` 同目录：
  - `jobs`：本次制作资源清单（job_id、名称、模型文件夹）
  - `dbc`：每文件 operations，`before`（force 重写时捕获）→ `after`（计划字段值）
  - `sql`：每文件目标表、记录、字段级内容
  - `mpq`：批次 MPQ 路径、内部文件清单、与上一批次的文件级 diff（新增/替换）
- **任务级关联**：`job.json` 的 `artifacts` 增 `audit` 路径字段；`schemas/patch.py` 的 DBC operation 模型增可选 `before` 字段。
- **可对照**：审计结构与 dry-run `plans/{dbc-plan,sql-plan,assets}` 同构（计划 → 实际产物逐项比对）。

### 12.3 入口无关与查阅

- 审计在 `build_mount_patches` 服务层统一生成——CLI `patch build`、HTTP `POST /api/patches/build`（`build_runner`）、AI Agent 调用均同源，天然满足"入口无关"。
- 查阅方式（规划）：CLI `patch audit {timestamp|job_id}`、Web 导出页任务审计视图、JSON 导出。

### 12.4 与现有校验报告的关系

`validation-report.json`（ID 一致性 pass/fail 检查）保留不变；`audit-report.json` 回答"改了什么"，前者回答"对不对"。

## 十三、规划：任务删除与中间产物清理 🚧

> 对应需求 v1.1 §3.9.1 / §3.9.2。

### 13.1 任务记录删除

| 层 | 改动 |
|----|------|
| 服务 | `patch_exporter.py` 增 `delete_patch_job(job_id)`（校验 job_id 命名模式防路径穿越，rmtree 任务目录） |
| API | `DELETE /api/patches/{job_id}` |
| CLI | `patch delete {job_id} [--yes]` |
| Web | 任务列表加操作列 + 二次确认 |

边界：删除仅移除 `workspace/patch-jobs/{job_id}/`；真相源（YAML/DBC）与已生成 SQL/MPQ 产物默认保留；批次级审计记录不随任务删除。

### 13.2 中间产物清理

- **新服务** `backend/app/services/workspace_cleaner.py`（规划）：
  - 清理目标：`workspace/patch-jobs/`（含遗留 `plans/`）、`workspace/mpq/{timestamp}/`、`workspace/reports/{timestamp}/`
  - dry-run 预览：列出将被清理的路径与占用体积
  - 守卫：`build_runner` 构建运行中拒绝清理；真相源与 `workspace/dist/` 永不在清理范围；MPQ 批次若已被 publish（dist 中存在对应产物）默认跳过
- 入口（规划）：CLI `patch clean [--dry-run] [--older-than]`、API、Web 导出页/设置页按钮。

## 十四、规划：MPQ 加密与混淆（不改子模块路线）🚧

> 对应需求 v1.1 §3.8。前提：不修改 `wow-mpq-cli` 子模块，仅用 `mpqcli create` 现有参数。

### 14.1 混淆等级

| 等级 | 参数 | 效果 |
|------|------|------|
| `none`（现状） | — | 常规 MPQ，任意工具可完整解包 |
| `basic`（基础混淆，推荐默认） | `--file-flags1 0 --file-flags2 0`（省略内部 `(listfile)`/`(attributes)` 文件） | 常见 MPQ 工具无法列出文件名，需逐个猜路径才能提取 |
| `encrypted`（实验性） | `basic` + `--flags 0x00010000`（MPQ_FILE_ENCRYPTED） | 文件内容按 MPQ 标准加密存储 |

可选附加：`-s` 弱数字签名（防篡改校验，非保密）。

### 14.2 已知限制（须如实告知用户）

- StormLib 的 MPQ 文件加密密钥由**文件名派生**、客户端可自动解密——该加密**不构成真正的保密**，只提高提取门槛。
- 内部路径**不可改名**：客户端按 `DBFilesClient\*.dbc` 等标准路径加载，混淆空间仅在"是否可枚举"层面。
- `encrypted` 级别下客户端能否正常读取加密的 `DBFilesClient` **需测试服实测**，存在不兼容风险；`basic` 级不改变文件内容，客户端无感。
- 强混淆（自定义密钥、彻底改名映射）需 fork `wow-mpq-cli` 子模块——记录为备选升级路线，本轮不采用。

### 14.3 集成点

**配置面**：

- HTTP：`POST /api/patches/build` 请求体可选 `obfuscation: none | basic | encrypted`（默认 `none`，`basic` 验证稳定后迁移默认值）。
- CLI：`patch build --obfuscation <level>`。
- `build_mpq`（`mount_patch_builder.py`）按该参数在 `mpqcli create` 追加对应参数（见 14.1 等级表）。

**产物标记**：

- 构建时写入 `workspace/mpq/{batch}/manifest.json`：文件清单 + `obfuscation` 字段——同一产物兼作审计对照与 MPQ 查看器清单回退（见 [04 §9.4](04模型与贴图渲染架构.md)）。
- `publish` 到 `workspace/dist/` 时沿用批次混淆标记，避免把 `encrypted` 产物误判为损坏。
- Web 任务列表以徽章显示混淆等级。

**与查看器联动**：`basic` 混淆档案的枚举依赖 manifest / 外部 listfile；`encrypted` 不影响系统侧枚举（StormLib 按文件名派生密钥自动解密）。见 04 §9.4。

**上线顺序与验证**：

1. 先启用 `basic`（文件内容不变、客户端无感，无验证依赖）。
2. `encrypted` 需测试服实测通过后才开放，checklist：① `DBFilesClient` 的 DBC 正常加载 → ② `Interface` 图标 BLP 正常显示 → ③ creature 模型/贴图正常渲染 → ④ 骑乘后进入世界无崩溃；逐项记录环境与结果。
3. 回滚：同批次 `patch build --force --obfuscation none` 重建并重新发布。

## 十五、规划：DBC 数据查看与维护（守卫式）🚧

> 对应需求 v1.2 §3.10。目标：在系统内直接查看 / 搜索 / 编辑 / 删除 `data/wow-dbc/src/dbc/` 的 DBC 记录；**资源管理记录守卫保护**（只读 + 来源引导），仅非管理记录可直改，避免 YAML↔DBC 双向漂移。

### 15.1 能力与数据源

| 能力 | 可行性 | 现状依据 |
|------|--------|---------|
| 查看 / 搜索 | ✅ 能力现成 | `wow_dbc_tool` 的 `DBCFile.query` 支持按字段过滤（`ID__gt`、`Name__contains` 等后缀语法，`dbc_file.py:86, 18-26`）；`schemas/` 目录 245 个 JSON schema 与 245 个 DBC 一一对应（`schema/registry.py:95-113`）；后端已有 mtime 进程缓存模式可泛化（`services/dbc_query.py:28-62`） |
| 编辑 | ✅ API 现成，需守卫 | `DBCFile.edit`（`dbc_file.py:146`）/ `add`（:177）/ `save`（:206，全量重建 string block 无悬空引用；推断 schema 且含字符串的文件拒绝保存 :223-228） |
| 删除 | ✅ API 现成，需守卫 | `DBCFile.delete`（`dbc_file.py:161`，按过滤删记录并返回数量） |

规模约束：`data/wow-dbc/src/dbc/` 共 **245 个文件约 93MB**（Spell.dbc 最大）→ 记录读取必须分页 + mtime 缓存，禁止全量载入响应。

现有差距：`api/dbc.py` 仅硬编码 ItemDisplayInfo 两个 GET 端点（`api/dbc.py:13-35`）；写路径仅 `mount_patch_builder.apply_dbc_operations`（add/edit，`mount_patch_builder.py:332-367`），全系统无 DBC delete 调用；前端无通用 DBC 表格组件。

### 15.2 守卫式编辑设计

**管理 / 引用记录判定**：服务层从 `data/registry.json` + 各资源 YAML 的 `dbc.*` 子结构派生两类集合（`{(dbc_file, record_id) → [来源资源]}`，按 mtime 缓存）。「管理」= patch build 所写记录（禁直改直删）；「引用」= 指向官方记录的外键（可改，删除时引用检查）：

| 类别 | YAML 字段 → DBC 文件 | 守卫行为 |
|------|----------------------|---------|
| 管理 | `dbc.creature_model_data.id` → CreatureModelData.dbc | 禁直改直删，409 + 来源资源清单 |
| 管理 | `dbc.creature_display_info.id` → CreatureDisplayInfo.dbc | 同上 |
| 管理 | `dbc.spell.id` → Spell.dbc | 同上 |
| 管理 | `dbc.item.id` → Item.dbc | 同上 |
| 引用 | `dbc.item.display_id` → ItemDisplayInfo.dbc | 可改；删除时引用检查警告 |
| 引用 | `dbc.spell.icon_id` → SpellIcon.dbc、`dbc.spell.visual_id` → SpellVisual*.dbc | 同上 |

（pets / npcs 取各自 YAML 子集；字段结构以 `schemas/dbc.py:45-107` 与实际 YAML 为准。）

**三层守卫**：

| 层 | 行为 |
|----|------|
| 查看标注 | 记录表格对管理记录标注来源资源徽章，点击跳转资源详情 |
| 写操作拦截 | 编辑 / 删除 API 命中管理记录时返回 409 + 来源资源清单，引导走资源编辑 + `patch build` |
| 删除引用检查 | 删除前交叉检查是否被其他 DBC / SQL 记录引用（扩展 `resource_validation` 思路），需二次确认 |

**与 `patch build` 并发互斥**：维护写操作（edit / delete / restore）执行前检查构建运行状态（参照 `build_runner.py:27` 的模块级锁 + 状态快照模式），构建运行中返回 409 拒绝；build 侧无需感知维护操作（维护低频、文件级粒度）。

**安全与恢复**：

- 保存前自动备份原文件到 `workspace/backups/dbc/{file}.{timestamp}`；每文件默认保留最近 20 份，随 §十三 clean 一并清理；`data/wow-dbc` 为 git 子模块，已提交历史仍可经 git 恢复。
- 恢复动作本身先备份当前态再回写，并记入操作日志（`action: restore`）。
- 操作日志 `workspace/reports/dbc-ops.jsonl`（JSONL，每行一条）：

| 字段 | 说明 |
|------|------|
| `ts` | ISO 时间戳 |
| `entry` | 操作入口：`web` / `cli` |
| `file` / `record_id` | 目标 DBC 文件与记录 |
| `action` | `edit` / `delete` / `restore` |
| `changes` | `[{field, before, after}]`（delete 记录全字段） |
| `backup` | 备份文件路径 |

  与 §十二 审计体系同源（同放 `workspace/reports/`），可一并纳入审计报告查阅。

### 15.3 API / CLI / Web 设计

**API**（扩展 `api/dbc.py`，规划；分页遵循系统约定 `page/page_size` + `{total, page, page_size, items}`，参照 `resources.py:216-233`）：

| 端点 | 说明 |
|------|------|
| `GET /api/dbc/files` | DBC 文件清单（记录数、大小、schema 注册状态） |
| `GET /api/dbc/{file}/records` | 记录分页列表（`page/page_size` + 字段过滤，字段名来自 schema） |
| `GET /api/dbc/{file}/records/{id}` | 单记录详情（含管理 / 引用标注与来源资源） |
| `PUT /api/dbc/{file}/records/{id}` | 编辑（守卫 + 构建互斥 + 备份 + 日志） |
| `DELETE /api/dbc/{file}/records/{id}` | 删除（守卫 + 引用检查 + 构建互斥 + 二次确认 + 日志） |
| `GET /api/dbc/{file}/backups` | 备份列表 |
| `POST /api/dbc/{file}/backups/{timestamp}/restore` | 恢复（先备份当前态 + 日志） |

**服务模块布局**：守卫与写路径落 `services/dbc_maintenance.py`（管理 / 引用集合派生、守卫检查、备份恢复、操作日志）；通用读取泛化沿用 `services/dbc_query.py:28-62` 的 mtime 缓存模式扩展，`api/dbc.py` 仅做薄路由。

**CLI**：扩展 §6.1 已规划的 `dbc` 组——子模块管理命令保留，新增数据维护子命令 `dbc query / get / edit / delete`（带守卫，写操作需 `--yes`）。

**Web**：新路由 `/dbc` + 页面（文件列表侧栏 + `DbcTableViewer` 记录表格 + 守卫徽章）；`DbcTableViewer` 为新组件，与 04 §九 MPQ 查看器共用。

### 15.4 与其他规划的关系

- **§十二 审计记录**：dbc-ops.jsonl 与补丁审计报告同放 `workspace/reports/`，查阅入口一致。
- **§6.1 `dbc` 命令组**：子模块管理（status/pull/diff）与数据维护（query/get/edit/delete）同组不同子命令。
- **04 §九 MPQ 查看器**：通用 DBC 读取能力统一由本节定义（api/dbc.py）；MPQ 内提取出的 `.dbc` 复用同一 API 形态与 `DbcTableViewer`。

### 15.5 已知限制（须如实提示）

- 仅支持标准 20 字节 WDBC 格式（`header.py:15-24`）；WDB2 等扩展格式不支持（现有 245 个文件均在能力范围内）。
- 4 字节对齐假设：`record_size ≠ field_count × 4` 的文件信任原 header，编辑字段可能错位（`header.py:66` 注释）。
- 字符串按 UTF-8 写回，官方客户端为 latin-1——非 ASCII 字符需实测客户端显示。
- 推断 schema（未注册字段定义）且含字符串的文件拒绝保存（`dbc_file.py:223-228`），避免字符串块悬空。

## 十六、相关文档

| 文档 | 路径 |
|------|------|
| Agent 交互架构 | `docs/arch/03Agent交互架构.md` |
| 数据存储设计 | `docs/arch/02数据存储设计.md` |
| 整体架构设计 | `docs/arch/01整体架构设计.md` |
