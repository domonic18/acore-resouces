# 坐骑补丁端到端流程手册

本手册面向未来的维护人员与 Agent，描述从**编辑坐骑资源**到**发布 MPQ 补丁**的完整工作流。

> **定位**：流程与决策指南，不写重复参考内容。字段细节、Spell.dbc 配置、DBC/SQL 表说明等请参阅文末引用文档。

---

## 1. 流程总览

```text
编辑资源 YAML ──▶ 补全官方数据 ──▶ 配置 Spell.dbc ──▶ 创建补丁任务 ──▶ 构建补丁 ──▶ 发布补丁 ──▶ 部署到服务端/客户端
     │                │                  │                │              │              │
     ▼                ▼                  ▼                ▼              ▼              ▼
 resource validate  /enrich-mount-data  /configure-  patch export   /build-mount-  /publish-   SQL + MPQ + DBC sync
                    (可选)              mount-spell  (CLI/Skill)    patch          patch
```

状态流转：

```text
requested ──▶ generated ──▶ applied
   ▲              │
   └──────────────┘ (失败时回到 requested 或标记 failed)
```

---

## 2. 前置条件

在开始之前，请确认：

1. 模型/贴图资源已放入 `sources/mounts/{model_folder}/`。
2. 坐骑 YAML 文件已存在且通过校验：
   ```bash
   cd backend
   uv run python -m app.cli resource validate --type mount --id 3
   ```
3. DBC 使用的 ID 范围已确认，不会与现有记录冲突。
4. `tools/wow-mpq-cli/build/bin/mpqcli` 已编译可用。

---

## 3. Step 1：补全/编辑坐骑元数据

如果坐骑 YAML 中官方数据（名称、描述、图标、物品 ID 等）缺失，可调用：

```text
/enrich-mount-data 0003
```

该 Skill 会结合多模态图片识别与 Wowhead 查询补全字段。

- 详见：[`docs/plan/坐骑数据补全_Skill实现方案.md`](./plan/坐骑数据补全_Skill实现方案.md)

---

## 4. Step 2：配置 Spell.dbc 字段

根据坐骑类型（陆地 / 飞行 / 水上 / 混合）确认 Spell.dbc 字段：

```text
/configure-mount-spell flying
```

关键字段由 `configure-mount-spell` Skill 指导填写，核心规则：

- `Mechanic = 21`（MOUNT）
- `Effect_1 = 6` + `EffectAura_1 = 207`（召唤坐骑光环）
- 飞行坐骑需要 `AttributesExD = 67108864`

- 字段参考：[`.claude/skills/configure-mount-spell/references/spell-dbc-fields.md`](../.claude/skills/configure-mount-spell/references/spell-dbc-fields.md)
- 属性参考：[`.claude/skills/configure-mount-spell/references/attributes-reference.md`](../.claude/skills/configure-mount-spell/references/attributes-reference.md)

---

## 5. Step 3：创建补丁任务

为单个坐骑创建补丁任务：

```bash
cd backend
uv run python -m app.cli patch export --type mount --id 3
```

系统会在 `workspace/patch-jobs/mount_0003/` 下仅写入任务元数据 `job.json`（job_id、资源 ID/名称/模型目录、状态、产物路径等）。资源定义以 `data/resources/mounts/*.yaml` 为唯一真相源，构建时按 `job.json` 中的 `resource_id` 现场读取，不再生成 `input/` 快照。

目录名固定为 `{type}_{id:04d}`，重复导出时会完全重置该目录，避免同一坐骑出现多个时间戳目录。任务目录不包含 `output/`，构建产物写入各自目录（DBC / SQL / MPQ）。

- 补丁任务结构：[`docs/plan/坐骑补丁自动化制作流程.md`](./plan/坐骑补丁自动化制作流程.md)
- Agent 交互与 CLI 设计：[`docs/arch/03Agent交互架构.md`](./arch/03Agent交互架构.md)

---

## 6. Step 4：构建补丁

### 6.1 干跑校验

先检查 DBC ID 冲突，不修改任何源文件；现场生成的计划会写入各任务 `plans/` 子目录供审查：

```bash
cd backend
uv run python -m app.cli patch build --all-requested --dry-run
```

### 6.2 正式构建

```text
/build-mount-patch --all-requested
```

或直接使用 CLI：

```bash
cd backend
uv run python -m app.cli patch build --all-requested
```

构建行为：

- `workspace/patch-jobs/` 按固定目录读取任务（`job.json`），并按其中的资源 ID 现场读取 `data/resources/` 最新 YAML 生成计划与资源清单，天然避免同一坐骑被处理多次。
- 源 DBC（`data/wow-dbc/src/dbc/*.dbc`）中已存在的记录会被跳过，不会被覆盖；仅新增缺失记录。
- 自动根据现场生成的资源清单（assets）计算 `CreatureModelData.ModelName`（统一使用小写 `creature\...` 前缀），使其与 MPQ 内路径一致。
- 生成 SQL 前会扫描 `data/sql/azerothcore-updates/` 中已有的 `item_template.entry`，已存在的坐骑不会重复生成 SQL；仅对新增坐骑写入 `DELETE` + `INSERT` 语句。
- MPQ 打包时按资源 `source_dir` 完整复制游戏文件（`.m2`、`.blp`、`.anim`、`.skin`、`.phys`）到 `creature/`，保留原目录结构与文件名；坐骑图标复制到 `Interface\icons\`。
- MPQ 打包完成后自动清理 `workspace/mpq/{timestamp}/staging/`，只保留 `patch-mounts.mpq` 与 `readme.txt`。

构建产物：

- DBC 直接编辑：`data/wow-dbc/src/dbc/*.dbc`（仅新增缺失记录）
- SQL：`data/sql/azerothcore-updates/mounts/{id:04d}_{slug}/{id:04d}_mount_add.sql`（如需掉落另有 `{id:04d}_mount_loot.sql`，每坐骑独立目录）
- MPQ：`workspace/mpq/{timestamp}/patch-mounts.mpq`
- 校验报告：`workspace/reports/{timestamp}/validation-report.json`

每个参与任务的 `job.json` 会更新为 `generated`。

### 6.3 产物审查

打开校验报告，确认所有 `checks` 通过。重点检查：

- Spell ID 与 `item_template.spellid_2` 一致
- `CreatureModelData.ID` 与 `CreatureDisplayInfo.ModelID` 一致
- `CreatureDisplayInfo.ID` 与 `creature_template.modelid1` 一致
- 模型路径全英文、无空格、与 MPQ 内实际路径一致

- DBC/SQL 实现参考：[`docs/references/06资源DBC与SQL实现参考.md`](./references/06资源DBC与SQL实现参考.md)

---

## 7. Step 5：发布补丁

将 MPQ 从 `workspace/mpq/` 发布到 `workspace/dist/`：

```text
/publish-patch
```

或直接使用 CLI：

```bash
cd backend
uv run python -m app.cli patch publish
```

发布结果：

```text
workspace/dist/
└── {timestamp}/
    ├── patch-zhCN-{number}.mpq
    └── readme.txt
```

`patch-zhCN-{number}.mpq` 是 WoW 客户端会自动加载的补丁文件名格式。

---

## 8. Step 6：部署到服务端/客户端

### 8.1 服务端 SQL

将 SQL 文件执行到 `acore_world` 数据库，或放置到 AzerothCore 自动更新目录。

### 8.2 客户端 MPQ

将 `patch-zhCN-{number}.mpq` 复制到客户端 `World of Warcraft/Data/` 目录。

### 8.3 DBC 同步到 acore-deploy（可选）

如果 `acore-deploy` 项目需要消费最新的 DBC：

```bash
cd backend
uv run python -m app.cli deploy sync-dbc --yes
```

> 当前 `deploy sync-dbc` 命令可能尚未实现，如需使用请先确认 CLI 是否存在。

- DBC 维护与同步：[`docs/arch/07DBC维护与同步方案.md`](./arch/07DBC维护与同步方案.md)

### 8.4 客户端缓存

客户端首次加载新 MPQ 时可能需要：

1. 删除 `Data/cache/` 目录。
2. 重启客户端。

---

## 9. Git / 子模块提交清单

完成补丁后，按以下顺序提交：

1. `data/resources/mounts/*.yaml`（资源定义变更，例如修正了 `model_folder`）。
2. `data/wow-dbc` 子模块（若构建过程中新增了缺失的 DBC 记录）。
   ```bash
   cd data/wow-dbc
   git add src/dbc/*.dbc
   git commit -m "chore(dbc): add custom mount records"
   ```
3. 服务端 SQL 文件（如果在仓库中维护）。
4. （可选）`workspace/dist/` 下的 MPQ 发布产物通常不入 Git，由分发站点管理。

`workspace/patch-jobs/` 下的固定目录为运行时产物，通常也不入 Git。

---

## 10. 失败处理与回滚

| 场景 | 处理方式 |
|------|---------|
| DBC ID 冲突 | `patch build --dry-run` 会列出冲突（计划同时写入任务 `plans/` 供审查）。决策：换 ID、改为 `edit` 操作、或跳过该任务。 |
| `wow-dbc-tool` 报错 | 检查现场生成的 DBC 计划字段类型与 schema 是否匹配（可用 `--dry-run` 落盘 `plans/` 审查）；确认源 DBC 未损坏。 |
| `mpqcli` 打包失败 | 已生成的 DBC/SQL 保留；修复后重新运行 `patch build`。 |
| 校验未通过 | 查看 `validation-report.json`，根据 `expected`/`actual` 修正资源 YAML 后重跑（计划由构建现场生成）。 |
| 需要重跑 | 将任务 `job.json` 的 `status` 改回 `requested`：
  `uv run python -m app.cli patch update {job_id} requested` |

---

## 11. 故障排查速查表

| 现象 | 可能原因 | 检查项 |
|------|---------|--------|
| 客户端不显示坐骑 | 缓存未清 / MPQ 未加载 | 删除 `Data/cache/`，确认 MPQ 在 `Data/` 根目录 |
| 服务器报 Spell 不存在 | Spell.dbc 未同步到服务端 | 检查 `data/wow-dbc/src/dbc/Spell.dbc` 是否包含该记录 |
| 服务器报 Item 不存在 | SQL 未执行 / item_template 缺失 | 检查 SQL 文件是否已应用到 `acore_world` |
| 坐骑模型显示异常 | 模型路径含中文/空格 / 资源未打包 | 检查 `validation-report.json` 路径一致性校验 |
| 模型缩放错误 | `CreatureDisplayInfo.CreatureModelScale` 或 `CreatureModelData.ModelScale` 设置不当 | 对比官方同类坐骑数值 |

---

## 引用文档

- 补丁任务与自动化流程：[`docs/plan/坐骑补丁自动化制作流程.md`](./plan/坐骑补丁自动化制作流程.md)
- 数据补全 Skill 方案：[`docs/plan/坐骑数据补全_Skill实现方案.md`](./plan/坐骑数据补全_Skill实现方案.md)
- Agent 交互与 CLI 设计：[`docs/arch/03Agent交互架构.md`](./arch/03Agent交互架构.md)
- DBC 维护与同步方案：[`docs/arch/07DBC维护与同步方案.md`](./arch/07DBC维护与同步方案.md)
- DBC/SQL 字段参考：[`docs/references/06资源DBC与SQL实现参考.md`](./references/06资源DBC与SQL实现参考.md)
- Spell.dbc 字段参考：[`.claude/skills/configure-mount-spell/references/spell-dbc-fields.md`](../.claude/skills/configure-mount-spell/references/spell-dbc-fields.md)
- 属性位掩码参考：[`.claude/skills/configure-mount-spell/references/attributes-reference.md`](../.claude/skills/configure-mount-spell/references/attributes-reference.md)
- 构建 Skill：[`.claude/skills/build-mount-patch/SKILL.md`](../.claude/skills/build-mount-patch/SKILL.md)
- 发布 Skill：[`.claude/skills/publish-patch/SKILL.md`](../.claude/skills/publish-patch/SKILL.md)
