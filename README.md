# 魔兽世界资源库

本项目用于整理、归档和版本管理《魔兽世界》（World of Warcraft）相关资源数据，包括 NPC、宠物、坐骑的预览图、图标以及对应的元数据清单，并提供 DBC / SQL / MPQ 补丁导出能力，将自定义资源落地到 AzerothCore 3.3.5a。

## 功能特性

- **资源管理**：坐骑 / 宠物 / NPC 的 CRUD、搜索、筛选、排序、分页，字段校验与跨资源 DBC ID 冲突检测（Web UI + REST API + CLI）。
- **预览服务**：`.blp` 贴图/图标解码预览、`.m2` 元数据读取、前端 Three.js 原生 M2 3D 渲染与贴图变体切换。
- **补丁导出**：创建补丁任务 → dry-run 校验 → 构建 DBC 修改 / AzerothCore SQL / MPQ 客户端补丁 → 发布分发（CLI `patch export/build/publish` 与 Web 导出页均可）。
- **Agent 接口**：Typer CLI + YAML/JSON 真相源，配合 `.claude/skills/` 下的数据补全与补丁构建 Skill。

## 目录结构

```
acore-resouces/
├── README.md              # 本文件
├── CLAUDE.md              # Claude Code AI 上下文文件
├── docs/                  # 项目文档（需求、架构设计、开发计划）
├── backend/               # Python FastAPI 后端 + CLI
├── apps/web/              # React + Vite 前端（Electron 内嵌）
├── apps/desktop/          # Electron 桌面外壳
├── tools/                 # wow-dbc-tool / wow-mpq-cli（git 子模块）
├── docker/                # backend / web 容器构建文件
├── data/                  # 纳入 Git 的结构化数据（YAML/JSON/Schema/映射）
│   ├── resources/         # 单资源 YAML（真相源）
│   ├── wow-dbc/           # 原始 DBC 真相源（git 子模块）
│   └── sql/azerothcore-updates/  # 生成的 SQL 补丁（软链接到 AzerothCore）
├── sources/               # 原始资源（不入 Git）
│   ├── mounts/            # 坐骑预览图与原始模型/贴图
│   ├── pets/              # 宠物预览图与原始模型/贴图
│   ├── npcs/              # NPC 预览图与原始模型/贴图
│   └── icons/             # 游戏图标（BLP）及索引
└── workspace/             # 运行时数据（不入 Git）
    ├── data/              # SQLite 运行时缓存
    ├── assets/            # BLP → WebP 缩略图缓存
    ├── patch-jobs/        # 补丁任务元数据
    ├── mpq/               # 批次 MPQ 构建产物
    ├── dist/              # 已发布 MPQ 分发目录
    └── reports/           # 补丁校验报告
```

## 资源目录说明

- `sources/mounts/`：按坐骑名称分子目录存放预览图，每个目录下包含同名或变体 PNG/GIF/M2/BLP。
- `sources/npcs/`：按 NPC 名称分子目录存放预览图与原始模型/贴图。
- `sources/pets/`：按宠物名称分子目录存放预览图与原始模型/贴图。
- `sources/icons/interface/icons/`：存放 `.blp` 图标文件，配套 `icon_inv.txt` / `icon_spell.txt` 索引。

## 技术栈

- **后端**：Python 3.11+ + FastAPI + SQLAlchemy + Pydantic + Typer
- **前端**：React 18.3+ + TypeScript + Vite + shadcn/ui + Tailwind CSS + Three.js
- **桌面**：Electron 33+
- **包管理**：后端使用 `uv`，前端使用 `npm`

## 开发命令

```bash
# 后端（在 backend/ 目录下）
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 前端（在 apps/web/ 目录下）
cd apps/web
npm install
npm run dev

# 桌面端（在 apps/desktop/ 目录下）
cd apps/desktop
npm install
npm run dev

# Docker 测试环境（web 服务，端口 8080）
docker compose up -d --build
```

根目录 `package.json` 仅作为命令编排入口，不存放依赖，因此**不要在根目录执行 `npm install`**。

## CLI

```bash
# 统一入口（在仓库根目录执行）
uv run --project backend python -m app.cli <group> <command>

# 常用示例
uv run --project backend python -m app.cli resource list --type mount
uv run --project backend python -m app.cli patch build --all-requested
```

命令组：`resource`（资源 CRUD/校验）、`wowhead`（官方数据查询）、`wago`（CASC 文件下载）、`patch`（补丁任务导出/构建/发布）。详见 `docs/arch/03Agent交互架构.md`。

## 版本管理

```bash
# 查看当前版本
git log --oneline

# 为当前数据快照打标签（示例）
git tag -a v1.0.0 -m "初始版本：NPC/宠物/坐骑资源 v1.0.0"
```

## 使用建议

1. **修改前请先拉取/同步最新提交**，避免覆盖他人更新。
2. **新增或替换预览图时**，同步更新对应资源 YAML 中的文件路径。
3. 大文件提交可能需要较长时间，请耐心等待。

## 注意事项

- 原始资源目录体积较大，不纳入 Git；若需版本管理可考虑本地备份或 Git LFS。
- 资源图片为游戏相关素材，仅供学习、研究和本地化开发使用。
- 运行时数据（SQLite、日志、缓存）存放在 `workspace/`，不纳入 Git。
