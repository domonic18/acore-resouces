# Agent 交互架构

## 一、设计目标

1. **零配置即可读取**：Agent 打开项目后，通过固定路径的 JSON/YAML 文件即可了解全部资源。
2. **明确的 Schema 约束**：`backend/app/schemas/` 下每个子结构都是 Pydantic 模型，字段类型与归一化规则可直接复用。
3. **可调用工具**：Agent 可调用项目内的 Typer CLI 完成 CRUD、校验、补丁任务。
4. **变更可追溯**：所有资源定义文件纳入 Git，Agent 修改后通过 Git diff 可审查。
5. **安全可控**：Agent 不直接覆盖 `*.dbc` / `acore-world` 数据库，只创建补丁任务并生成 SQL 补丁，由 `patch build` 与人工确认后落地。
6. **本地优先**：Agent 读取本地 YAML/JSON 文件，并通过本地 CLI / REST API 完成写入操作。

---

## 二、Agent 数据访问层

### 2.1 资源文件路径约定

```
acore-resouces/
├── data/
│   ├── resources/              # 单资源 YAML 文件
│   │   ├── mounts/             # 命名：{id:04d}-{model_folder}.yaml
│   │   ├── pets/
│   │   └── npcs/
│   ├── mapping/                # xlsx 列映射配置
│   ├── sql/azerothcore-updates/# patch build 写入的 SQL 补丁
│   ├── wow-dbc/                # 子模块：原始 DBC 真相源
│   └── registry.json           # 资源索引（系统自动生成）
```

### 2.2 资源索引（registry.json）

`registry.json` 是 Agent 快速了解项目资源全貌的入口：

```json
{
  "version": "1.0",
  "counts": { "mounts": 451, "pets": 107, "npcs": 226 },
  "mounts": [
    {
      "id": 3,
      "name": "梦光符文牡鹿",
      "model_folder": "ardenwealdstagmount影叶符文牡鹿",
      "file": "data/resources/mounts/0003-ardenwealdstagmount影叶符文牡鹿.yaml",
      "debug_passed": true,
      "added": true
    }
  ],
  "pets": [ /* ... */ ],
  "npcs": [ /* ... */ ]
}
```

### 2.3 单资源文件格式

每个资源一个 YAML 文件，详细字段见 [docs/arch/02数据存储设计.md#四资源定义文件结构](./02数据存储设计.md)。Agent 直接读写时务必遵守：

- 字段命名遵循 `snake_case`；个别字段（`Item.class`、`item_template.Quality` 等）保留 DBC/SQL 原大小写。
- 空值统一写 `null`，不要写空字符串或 `0` 占位（Pydantic 会归一化，但显式 `null` 更易读）。
- 不要直接修改 `registry.json`，由系统在保存资源时重建。

---

## 三、Agent 工具接口

### 3.1 接口分层

```
Agent
  │
  ├──► CLI 工具层（backend/app/cli/）       —— 主要入口
  │      │
  │      ▼
  ├──► Python API 层（backend/app/services/）
  │      │
  │      ▼
  └──► 数据层（YAML 文件 + SQLite 缓存 + DBC 子模块）
```

Agent 也可直接通过 HTTP 调用 REST API（`http://localhost:8000/api/...`），后端服务由 Electron 桌面外壳或 `uv run uvicorn app.main:app` 启动。

### 3.2 CLI 工具清单

所有 CLI 使用 **Typer + Rich** 构建，统一入口：

```bash
uv run --project backend python -m app.cli <group> <command> [options]
```

| 命令组 | 命令 | 用途 |
|--------|------|------|
| `resource` | `list` | 列出资源（支持 `--type`、`--search`、`--added`、`--debug-passed`） |
| | `get` | 查看单个资源详情（JSON 输出） |
| | `update` | 更新字段：`key=value`，支持点号路径（如 `official_db.name=新名称`） |
| | `delete` | 删除资源（默认二次确认，`--yes` 跳过） |
| | `validate` | 校验资源（关联一致性 + 跨资源重复 ID 检测） |
| `xlsx` | `import` | 从 `.xlsx` 一次性导入（支持 `--dry-run` / `--limit` / `--no-check-duplicates`） |
| `wowhead` | `lookup-pet` / `lookup-mount` | Wowhead 官方数据查询，自动回退 WotLK/零售版与中英文 |
| `wago` | `builds` / `latest` / `search` / `download` | wago.tools CASC 文件查询与下载 |
| `patch` | `export` | 为单个资源创建补丁任务（`--type`、`--id`） |
| | `build` | 批量构建 DBC/SQL/MPQ（`--all-requested` 或 `--jobs`，支持 `--dry-run`） |
| | `publish` | 发布 MPQ 到 `workspace/dist/`（`--start-number`、`--dry-run`） |
| | `list` / `get` / `update` | 补丁任务查询与状态更新 |

> 命令的具体选项可能随版本演进，使用 `--help` 查看最新参数：例如 `uv run --project backend python -m app.cli patch build --help`。

### 3.3 资源 CRUD 接口

```bash
# 列出资源
uv run --project backend python -m app.cli resource list --type mount
uv run --project backend python -m app.cli resource list --type mount \
    --added --debug-passed
uv run --project backend python -m app.cli resource list --type mount --search "符文"

# 查看单个资源（JSON）
uv run --project backend python -m app.cli resource get mount 3

# 更新字段（注意 key=value 之间不能有空格）
uv run --project backend python -m app.cli resource update mount 3 \
    official_db.name="咒缚恒龙"

# 删除资源
uv run --project backend python -m app.cli resource delete mount 3 --yes

# 校验（关联一致性 + 重复 ID）
uv run --project backend python -m app.cli resource validate --type mount --id 3
```

### 3.4 xlsx 一次性导入

`.xlsx` 仅作为一次性导入源，导入后不再反向同步。

```bash
# 从默认路径 imports/坐骑列表.xlsx 导入
uv run --project backend python -m app.cli xlsx import mount

# 指定文件并干跑预览
uv run --project backend python -m app.cli xlsx import mount \
    --input imports/坐骑列表.xlsx --dry-run --limit 50
```

### 3.5 官方数据补全（Wowhead / wago.tools）

```bash
# 查询 Wowhead 坐骑官方数据（JSON 输出）
uv run --project backend python -m app.cli wowhead lookup-mount "梦光符文牡鹿"

# 查询 Wowhead 宠物
uv run --project backend python -m app.cli wowhead lookup-pet "枭兽宝宝"

# 列出 wago.tools 可用构建
uv run --project backend python -m app.cli wago builds --product wow_classic

# 按关键词搜索 CASC 文件并下载第一个匹配
uv run --project backend python -m app.cli wago download \
    --search "interface/icons/inv_ardenwealdstagmount_blue" \
    --output sources/icons/interface/icons/
```

> 这两个命令通常被 `enrich-mount-data` / `enrich-pet-data` Skill 间接调用，Agent 也可以直接使用它们做一次性查询。

### 3.6 补丁任务接口

补丁工作流分为三段：**创建补丁任务** → **构建产物** → **发布分发**。

```bash
# 1) 为单个资源创建补丁任务（仅写 workspace/patch-jobs/{job_id}/job.json，
#    资源以 data/resources/ 真相源为准，构建时现场读取）
uv run --project backend python -m app.cli patch export --type mount --id 3

# 2) 批量构建（处理所有 requested 状态的任务）
uv run --project backend python -m app.cli patch build --all-requested

# 或指定任务 ID
uv run --project backend python -m app.cli patch build --jobs mount_0003 --jobs mount_0004

# 仅校验冲突，现场生成的计划写入各任务 plans/ 子目录供审查
uv run --project backend python -m app.cli patch build --all-requested --dry-run

# 3) 发布 MPQ 到 workspace/dist/patch-zhCN-{N}.mpq
uv run --project backend python -m app.cli patch publish --start-number 5

# 查询任务
uv run --project backend python -m app.cli patch list --status requested
uv run --project backend python -m app.cli patch get mount_0003
```

`patch build` 会：

1. 按 `job.json` 中的 `resource_id` 现场读取 `data/resources/` 最新 YAML，在内存中生成 DBC/SQL 计划与资源清单（不落盘快照）。
2. 调用 `wow-dbc-tool` 编辑 `data/wow-dbc/src/dbc/*.dbc`（仅新增缺失记录）。
3. 按坐骑生成 SQL 到 `data/sql/azerothcore-updates/mounts/{id:04d}_{slug}/`（软链接到 `acore-deploy`）。
4. 调用 `wow-mpq-cli` 打包到 `workspace/mpq/{batch}/patch-mounts.mpq`。
5. 输出 `workspace/reports/{batch}/validation-report.json` 校验报告，更新 `job.json` 状态为 `generated`。

### 3.7 补丁任务结构

```text
workspace/patch-jobs/{job_id}/
├── job.json                   # 任务元数据、状态、产物路径（patch export 仅写此文件）
└── plans/                     # 仅 patch build --dry-run 生成，供审查；正式 build 会清理
    ├── dbc-plan.yaml          # 现场生成的 DBC add/edit 计划
    ├── sql-plan.yaml          # 现场生成的目标表与记录
    └── assets.json            # 现场生成的模型/贴图/图标文件清单
```

> - `job_id` 当前实现为 `{resource_type}_{id:04d}`（如 `mount_0003`），不再带时间戳，便于幂等重跑。
> - 资源定义的唯一真相源是 `data/resources/mounts/*.yaml`：`patch export` 不再生成 `input/` 快照，`patch build` 按 `job.json` 中的 `resource_id` 现场读取最新 YAML。
> - 构建产物不在任务目录内：DBC 直接编辑 `data/wow-dbc/src/dbc/`，SQL 写入 `data/sql/azerothcore-updates/mounts/`（每坐骑独立目录），MPQ 写入 `workspace/mpq/{batch}/`。

---

## 四、Agent 工作流

### 4.1 读取资源工作流

```
Agent 需要了解某坐骑信息
   ↓
读取 data/registry.json 定位资源文件
   ↓
读取 data/resources/mounts/0003-xxx.yaml
   ↓
解析 YAML 获取 DBC/DB 字段（参考 backend/app/schemas/）
   ↓
如需图片：访问 sources/mounts/xxx/xxx.png
   ↓
如需贴图/3D 预览：通过 REST API /api/preview/* 或桌面应用
```

### 4.2 修改资源工作流

```
Agent 收到修改指令
   ↓
读取资源 YAML 文件 或 调用 CLI resource get
   ↓
修改字段值（直接写 YAML 或 调用 CLI resource update）
   ↓
调用 CLI resource validate 校验关联一致性 + 重复 ID
   ↓
CLI / resource_store 自动同步 SQLite 与 registry.json
   ↓
（可选）在 Web 前端查看效果或 git diff 审查变更
```

### 4.3 生成 DBC/SQL/MPQ 补丁工作流

```
Agent 收到"把坐骑 X 加入游戏"指令
   ↓
读取资源 YAML + resource validate
   ↓
CLI patch export 创建补丁任务（仅写 workspace/patch-jobs/{job_id}/job.json）
   ↓
（或 Web 前端勾选资源点击"导出补丁原料"批量创建）
   ↓
CLI patch build --all-requested
   ├─ 按 job.json 中的资源 ID 现场读取 data/resources/ YAML 生成计划
   ├─ 调用 wow-dbc-tool 编辑 DBC → data/wow-dbc/src/dbc/
   ├─ 生成 SQL → data/sql/azerothcore-updates/mounts/{id:04d}_{slug}/
   ├─ 调用 wow-mpq-cli 打包 → workspace/mpq/{batch}/patch-mounts.mpq
   └─ 输出 workspace/reports/{batch}/validation-report.json 校验报告
   ↓
CLI patch publish --start-number 5
   └─ 复制到 workspace/dist/patch-zhCN-5.mpq, 6.mpq, ...
   ↓
人工审查产物 → 同步到 acore-deploy / 客户端 Data/
```

最终产物分布：

- `data/wow-dbc/src/dbc/`：修改后的 DBC 文件（直接编辑，仅新增缺失记录）
- `data/sql/azerothcore-updates/mounts/{id:04d}_{slug}/`：AzerothCore SQL 补丁，每坐骑独立目录（软链接到 `acore-deploy`）
- `workspace/mpq/{batch}/patch-mounts.mpq`：原始 MPQ（按批次归档）
- `workspace/dist/patch-zhCN-{N}.mpq`：发布后的连续编号 MPQ

### 4.4 Agent 元数据驱动开发流程（典型场景）

```
Agent 接到开发任务（如"把咒缚恒龙加入游戏"）
   ↓
CLI resource get mount {id} 读取完整元数据
   ↓
按需用 wago/wowhead CLI 或 enrich-* Skill 补全 official_db
   ↓
按需用 configure-mount-spell Skill 微调 Spell.dbc 字段
   ↓
CLI resource validate 通过
   ↓
CLI patch export --type mount --id {id}
   ↓
CLI patch build --jobs mount_{id:04d}
   ↓
CLI patch publish --start-number {next}
   ↓
人工执行 acore-update-dbc.sh / 重启 worldserver 验证
```

### 4.5 配合 Claude Skill 的常用模式

| Skill | 触发时机 | 输入 → 输出 |
|-------|---------|------------|
| `enrich-mount-data` / `enrich-pet-data` | 缺失 Wowhead 官方字段 | YAML + 图像识别 → 补全 `official_db` / 图标 |
| `configure-mount-spell` | 需要按坐骑类型调整 Spell.dbc 字段 | YAML → 指导 Attributes / Mechanic / Aura 配置 |
| `build-mount-patch` | 已有补丁任务（job.json），需要生成最终 DBC/SQL/MPQ | `patch-jobs/{id}/job.json` + `data/resources/` 真相源 → `data/wow-dbc/` / `data/sql/` / `workspace/mpq/` |
| `export-mount-jobs` | Web 端批量勾选坐骑导出 | 资源 ID 列表 → 多个 `patch-jobs/{id}/` |
| `publish-patch` | 将 `workspace/mpq/` 发布到 `workspace/dist/` | 批次目录 → `patch-zhCN-N.mpq` |

---

## 五、Agent 安全约束

### 5.1 禁止直接操作

Agent **不得**直接执行以下操作：

- 直接修改 `.xlsx` 文件结构（`.xlsx` 仅作为一次性导入源）。
- 直接覆盖 `data/wow-dbc/src/dbc/*.dbc`（必须由 `patch build` 通过 `wow-dbc-tool` 写入）。
- 直接连接 `acore-world` 数据库执行写入（必须通过 `acore-update-db.sh` 或追加到 `data/sql/azerothcore-updates/`）。
- 直接删除原始图片资源目录或 `.xlsx` 源文件。
- 直接修改 `registry.json`（必须由系统同步生成）。
- 强制覆盖 `data/sql/azerothcore-updates/`（该目录是软链接到 `acore-deploy`，破坏后会影响部署）。

### 5.2 推荐操作流程

| 操作 | 推荐方式 |
|------|---------|
| 读取资源 | 直接读取 YAML 或调用 CLI `resource get` |
| 修改资源 | CLI `resource update` 或直接写 YAML + `resource validate` |
| xlsx 一次性导入 | CLI `xlsx import` |
| 创建补丁任务 | CLI `patch export` 或 Web 前端批量导出 |
| 构建 DBC/SQL/MPQ | CLI `patch build` |
| 发布 MPQ | CLI `patch publish` |
| 应用到 acore-deploy | 人工执行 `acore-update-dbc.sh` / `acore-update-db.sh` |

### 5.3 大文件处理

- `.xlsx` 文件共约 730MB+，仅用于一次性导入；导入后不再读取。
- 图片目录数 GB，Agent 不应遍历所有图片；优先使用 `registry.json` 和单资源 YAML 文件，必要时再访问 `sources/{type}/{model_folder}/`。
- `.m2` / `.blp` 文件按需通过预览 API 或桌面应用访问，避免在 Agent 中读取整个二进制。

---

## 六、附录：Agent 常用代码片段

### 6.1 读取所有坐骑名称和 Spell ID

```python
import yaml
from pathlib import Path

for f in Path('data/resources/mounts').glob('*.yaml'):
    data = yaml.safe_load(f.read_text())
    name = data['official_db']['name']
    spell_id = data['dbc']['spell']['id']
    print(f'{name}: spell={spell_id}')
```

### 6.2 批量修改字段并同步 SQLite

直接修改 YAML 后，调用 CLI 触发 `resource_store.save_resource()` 重建 SQLite 缓存：

```bash
uv run --project backend python -m app.cli resource validate --type mount
```

或在 Python 中：

```python
from app.services.resource_store import load_resource, save_resource

resource = load_resource("mount", 3)
resource.official_db.name = "新名称"
save_resource(resource)  # 同时写 YAML + SQLite + registry
```

### 6.3 通过 CLI 获取资源详情

```bash
uv run --project backend python -m app.cli resource get mount 3
```

### 6.4 通过 CLI 校验并创建补丁任务

```bash
# 校验单个资源
uv run --project backend python -m app.cli resource validate --type mount --id 3

# 创建补丁任务（仅写 job.json）
uv run --project backend python -m app.cli patch export --type mount --id 3
```

### 6.5 通过 Skill 生成最终补丁

```bash
/build-mount-patch mount_0003
```

### 6.6 REST API 速查

| 端点 | 用途 |
|------|------|
| `GET /api/resources/{type}` | 分页列出资源（支持 `search` / `added` / `debug_passed` / `sort_by` / `sort_order`） |
| `GET /api/resources/{type}/{id}` | 获取单个资源详情（含 `duplicate_issues`） |
| `PUT /api/resources/{type}/{id}` | 更新资源字段（`ResourceUpdateRequest`） |
| `GET /api/resources/{type}/{id}/assets` | 资源目录下的 `.m2` / `.blp` / 图标清单 |
| `GET /api/preview/blp/{path}` | BLP → WebP 预览（可选 `?size=`） |
| `GET /api/preview/icon/{icon_name}` | 按图标名查找并预览 |
| `GET /api/preview/icons` | 所有可用图标列表 |
| `GET /api/preview/model/{model_folder}` | M2 元数据 + skin/blp/anim 清单 |
| `GET /api/preview/m2/{model_folder}/file/{relative_path}` | 流式返回 M2/skin/anim 字节 |
| `GET /api/files/tree?root=sources&depth=N` | 目录树（懒加载） |
| `GET /api/files/tree/{root}?path=...` | 子目录树 |
| `POST /api/patches/export-request` | 批量创建补丁任务 |
| `GET /api/patches` | 分页列出补丁任务 |
