# 魔兽世界资源库

本项目用于整理、归档和版本管理《魔兽世界》（World of Warcraft）相关资源数据，包括 NPC、宠物、坐骑的预览图、图标以及对应的元数据清单。

## 目录结构

```
acore-resouces/
├── README.md              # 本文件
├── CLAUDE.md              # Claude Code AI 上下文文件
├── docs/                  # 项目文档（需求、架构设计、开发计划）
├── backend/               # Python FastAPI 后端 + CLI
├── apps/web/              # React + Vite 前端（Electron 内嵌）
├── apps/desktop/          # Electron 桌面外壳
├── tools/model-converter/ # Rust M2 → glTF 转换工具
├── data/                  # 纳入 Git 的结构化数据（YAML/JSON/Schema/映射）
├── patches/               # 生成的 DBC/SQL 补丁（纳入 Git）
├── sources/               # 原始资源（不入 Git）
│   ├── mounts/            # 坐骑预览图与原始模型/贴图
│   ├── pets/              # 宠物预览图与原始模型/贴图
│   ├── npcs/              # NPC 预览图与原始模型/贴图
│   └── icons/             # 游戏图标（BLP）及索引
├── imports/               # 一次性 xlsx 导入源（不入 Git）
│   ├── 坐骑列表.xlsx
│   ├── 宠物列表.xlsx
│   └── NPC列表.xlsx
├── assets/                # 运行时缩略图、glTF 缓存（不入 Git）
└── workspace/             # 运行时数据（SQLite、日志等，不入 Git）
```

## 核心数据文件

| 文件 | 说明 | 大小（约） |
|------|------|-----------|
| `imports/NPC列表.xlsx` | NPC 名称、模型路径、预览图等元数据 | ~439 MB |
| `imports/宠物列表.xlsx` | 宠物名称、模型路径、预览图等元数据 | ~140 MB |
| `imports/坐骑列表.xlsx` | 坐骑名称、模型路径、预览图等元数据 | ~153 MB |

这些 `.xlsx` 文件是项目的历史数据源，**不纳入 Git 版本管理**（体积超过 GitHub 单文件限制），后续通过 Release/网盘分发。系统初始化时一次性导入为 `data/resources/` 下的 YAML 文件，导入后 `.xlsx` 不再作为同步来源。

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
```

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

- 本项目中的 `.xlsx` 文件和原始资源目录体积较大，不纳入 Git；若需版本管理可考虑本地备份或 Git LFS。
- 资源图片为游戏相关素材，仅供学习、研究和本地化开发使用。
- 运行时数据（SQLite、日志、缓存）存放在 `workspace/` 和 `assets/`，不纳入 Git。
