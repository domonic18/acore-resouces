---
name: build-mount-patch
description: >
  根据补丁任务（job.json 引用资源 ID），现场读取 data/resources/ 真相源 YAML，
  批量生成 WoW 3.3.5a 自定义坐骑补丁：直接编辑源 DBC、追加 SQL 到
  AzerothCore updates 目录、生成批次 MPQ。
argument-hint: <resource-id-or-job-id-or-batch>
allowed-tools: [Read, Edit, Write, Bash]
model: sonnet
---

# /build-mount-patch

根据补丁任务，批量为 WoW 3.3.5a 自定义坐骑生成服务端 SQL、客户端 DBC 与 MPQ 补丁。

**单一真相源**：资源定义始终以 `data/resources/mounts/*.yaml` 为准；任务目录
`workspace/patch-jobs/{job_id}/` 仅含轻量 `job.json`（任务元数据与状态），
构建时现场读取最新 YAML 并在内存中生成 DBC/SQL 计划，不落盘任何快照。

工作流采用**集中编辑、批次输出**：

- DBC 直接修改 `data/wow-dbc/src/dbc/` 下的源文件（wow-dbc 子模块，由用户手动提交）。
- SQL 追加为单份文件到 AzerothCore updates 目录。
- MPQ 输出为单份文件到 `workspace/mpq/{timestamp}/`。

## 输入格式

用户可提供以下任意一种：

- **`--all-requested`**：处理当前所有可处理状态的任务（推荐）。
- **任务 ID 列表**：`mount_0003`
- **资源 ID**：`0003`、`3`、`坐骑 0003`（对应任务 `mount_0003`）

若未提供或无法解析，询问用户。

## 执行流程

### 1. 定位任务

项目根目录假设为当前工作目录 `/Users/deadwalk/Code/acore-resouces`。

列出补丁任务：

```bash
cd backend && uv run python -m app.cli patch list
```

- 任务目录 `workspace/patch-jobs/{job_id}/` 仅含 `job.json`（记录 resource_type、
  resource_id、status 等元数据）。
- 资源定义读取 `data/resources/mounts/{id:04d}-*.yaml` 真相源。

### 2. 调用批量构建命令

先使用 `--dry-run` 校验冲突并生成审查计划（写入各任务目录 `plans/` 子目录）：

```bash
cd backend
uv run python -m app.cli patch build --all-requested --dry-run
```

审查计划内容（现场从真相源生成）：

```bash
cat workspace/patch-jobs/mount_0003/plans/dbc-plan.yaml
cat workspace/patch-jobs/mount_0003/plans/sql-plan.yaml
cat workspace/patch-jobs/mount_0003/plans/assets.json
```

确认无误后正式执行（会清理遗留 plans/ 并写入 DBC/SQL/MPQ）：

```bash
cd backend
uv run python -m app.cli patch build --all-requested
```

或处理指定任务：

```bash
cd backend
uv run python -m app.cli patch build --jobs mount_0003
```

命令内部完成以下步骤：

1. **现场构建上下文**：按 `job.json` 中的资源 ID 读取 `data/resources/` 最新 YAML，
   在内存中生成 DBC/SQL 计划与资源清单（资源 YAML 已删除的任务会警告跳过）。
2. **ID 冲突检查**：对 DBC 计划中每个 `add` 操作的 `record_id`，检查同一批次内是否重复。
3. **路径清理**：自动去除 `model_folder` 中的中文、空格及其他非 ASCII 字符，确保 DBC 与 MPQ 中的模型路径全英文。自动按实际 m2 文件计算 `CreatureModelData.dbc` 的 `ModelName`（`creature\<sanitized_folder>\<main_model>`）。
4. **应用 DBC 操作**：使用 `wow-dbc-tool` Python API 直接在 `data/wow-dbc/src/dbc/*.dbc` 上新增/编辑记录（源 DBC 已存在的记录跳过，不覆盖）。
5. **生成坐骑 SQL**：为每只坐骑在 `data/sql/azerothcore-updates/mounts/{id:04d}_{slug}/` 创建 `{id:04d}_mount_add.sql`（及 `_mount_loot.sql`）。
   - 生成前会扫描已有 `.sql` 文件，收集其中 `item_template.entry` 值。
   - 若某个坐骑的 `item_template.entry` 已存在，则跳过该坐骑，避免重复生成 SQL。
   - 仅对真正新增的坐骑写入 `DELETE` + `INSERT` 语句，保证幂等。
6. **构建批次 MPQ**：在 `workspace/mpq/YYYYMMDD_HHMMSS/` 下创建 `patch-mounts.mpq` 与 `readme.txt`，包含编辑后的 DBC 与各任务的客户端资源。
7. **一致性校验**：生成校验报告 `workspace/reports/YYYYMMDD_HHMMSS/validation-report.json`，检查 DBC/SQL/MPQ 之间的 ID 与路径一致性。
8. **更新任务状态**：将参与批次的每个任务 `status` 改为 `generated`，`artifacts.output` 指向批次 SQL/MPQ/报告路径。

### 3. 验证产物

```bash
# 验证源 DBC 中已新增记录
uv run --project tools/wow-dbc-tool python -m wow_dbc_tool \
  query data/wow-dbc/src/dbc/Spell.dbc --filter "ID={spell_id}" --json

# 验证 MPQ 内容
tools/wow-mpq-cli/build/bin/mpqcli list \
  workspace/mpq/YYYYMMDD_HHMMSS/patch-mounts.mpq

# 查看校验报告
cat workspace/reports/YYYYMMDD_HHMMSS/validation-report.json
```

### 4. 一致性校验规则

脚本会自动执行以下检查，并输出报告到 `workspace/reports/YYYYMMDD_HHMMSS/validation-report.json`：

- **法术 ID 一致性**：`Spell.dbc.ID` 必须与 `item_template.spellid_2` 一致。
- **模型数据一致性**：`CreatureModelData.dbc.ID` 必须与 `CreatureDisplayInfo.dbc.ModelID` 一致。
- **显示信息一致性**：`CreatureDisplayInfo.dbc.ID` 必须与 `creature_template.modelid1` 和 `creature_model_info.display_id` 一致。
- **视觉 ID 一致性**：`creature_template.entry` 必须与 `Spell.dbc.SpellVisualID_1`（即 `spell.visual_id`）一致。
- **模型路径一致性**：`CreatureModelData.dbc.ModelName` 必须对应 MPQ 中实际存在的文件路径。
- **路径字符约束**：DBC 与 MPQ 中的模型路径必须全英文、无空格、无中文。

报告包含每个坐骑的通过状态、`expected`/`actual` 值及错误信息，供人工确认。

### 5. 报告结果

向用户展示：

- 本次处理的任务 ID 列表
- 资源名称列表
- 修改的 DBC 文件列表
- 生成的 SQL 文件路径
- 生成的 MPQ 文件路径
- 生成的校验报告路径
- 下一步建议：
  - 手动提交 `data/wow-dbc` 子模块的 DBC 改动。
  - 将 `workspace/mpq/YYYYMMDD_HHMMSS/patch-mounts.mpq` 放入客户端 `Data/` 目录。
  - 在 AzerothCore 数据库中执行 SQL 文件（或依赖自动更新器）。
  - 人工确认 `workspace/reports/YYYYMMDD_HHMMSS/validation-report.json` 中的校验结果。

## 输出产物示例

```
data/wow-dbc/src/dbc/
├── CreatureModelData.dbc   (已新增记录)
├── CreatureDisplayInfo.dbc (已新增记录)
├── Spell.dbc               (已新增记录)
└── Item.dbc                (已新增记录)

data/sql/azerothcore-updates/ -> /Users/deadwalk/Code/azerothcore-wotlk/.../updates/
└── mounts/0003_ardenwealdstagmount/
    └── 0003_mount_add.sql

workspace/mpq/20260724_123045/
├── patch-mounts.mpq
└── readme.txt

workspace/reports/20260724_123045/
└── validation-report.json

workspace/patch-jobs/mount_0003/
└── job.json                (status=generated，artifacts.output 指向批次产物)
```

dry-run 时额外生成（正式 build 前会清理）：

```
workspace/patch-jobs/mount_0003/plans/
├── dbc-plan.yaml
├── sql-plan.yaml
└── assets.json
```

## 失败处理

- **ID 冲突**：脚本报错退出，不修改任何文件。向用户报告冲突的任务、DBC 文件与 ID，等待决策（跳过、换 ID 或改为 edit）。
- **资源 YAML 缺失**：任务被警告并跳过，不阻塞批次内其他任务。
- **wow-dbc-tool 失败**：输出原始错误，不回写任务状态。
- **mpqcli 失败**：保留已生成的 DBC/SQL，仅报告 MPQ 打包失败，任务状态可标记为 `failed`。
- **部分成功**：建议将失败任务状态改为 `failed`，summary 记录失败原因。

## 注意事项

- `patch build` 命令不执行任何 `git commit`，DBC 源文件修改后需用户手动提交 `data/wow-dbc` 子模块。
- `data/sql/azerothcore-updates` 是本地软链接，已加入 `.gitignore`，不会提交到仓库。
- backend 已将 `tools/wow-dbc-tool` 作为路径依赖引入，无需再手动设置 `PYTHONPATH`。

## 依赖

- `uv`（backend 环境）
- `tools/wow-dbc-tool/`（backend 已将其作为路径依赖引入）
- `tools/wow-mpq-cli/build/bin/mpqcli`
- `data/wow-dbc/src/dbc/` 原始 DBC 文件

## 示例

```
/build-mount-patch --all-requested
/build-mount-patch mount_0003
/build-mount-patch 0003
```
