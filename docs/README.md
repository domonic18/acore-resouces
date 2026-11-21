# 文档目录

本目录存放 `acore-resouces` 资源管理系统的需求与设计方案，分为 **需求（requirement）**、**架构（arch）**、**流程（workflows）**、**参考资料（references）** 等几类。

## 文档结构

```
docs/
├── requirement/                    # 需求文档：只描述“做什么”
│   ├── 资源管理系统需求v1.0.md
│   ├── 坐骑WLK副本掉落规划.md
│   └── 坐骑功能玩法策略方案.md
├── arch/                           # 架构文档：描述“怎么做”
│   ├── 01整体架构设计.md
│   ├── 02数据存储设计.md
│   ├── 03Agent交互架构.md
│   ├── 04模型与贴图渲染架构.md
│   ├── 05测试策略.md
│   └── 07DBC维护与同步方案.md
├── plan/                           # 开发计划与专项方案
│   └── 开发计划.md
├── prototypes/                     # 早期 HTML 原型（历史参考，实际以 apps/web 为准）
├── references/                     # 参考资料
│   └── 06资源DBC与SQL实现参考.md
├── workflows/                      # 操作流程手册
│   ├── 01坐骑生产流程总纲.md       # 加一只新坐骑的完整流程（9 步）
│   └── 02坐骑特性附录.md           # 7 个特殊功能的制作方法
└── README.md                       # 本文件
```

## 快速导航

| 你想了解什么 | 阅读文档 |
|-------------|---------|
| **怎么加一只新坐骑** | **[`workflows/01坐骑生产流程总纲.md`](./workflows/01坐骑生产流程总纲.md)** |
| 特殊功能坐骑怎么做（多人骑乘/水面/水下/采集/变色/拍卖行/商人修理） | [`workflows/02坐骑特性附录.md`](./workflows/02坐骑特性附录.md) |
| 系统需要实现哪些功能 | [`requirement/资源管理系统需求v1.0.md`](./requirement/资源管理系统需求v1.0.md) |
| 哪些坐骑适合放进 WLK 副本尾王掉落 | [`requirement/坐骑WLK副本掉落规划.md`](./requirement/坐骑WLK副本掉落规划.md) |
| 坐骑玩法还能怎么扩展 | [`requirement/坐骑功能玩法策略方案.md`](./requirement/坐骑功能玩法策略方案.md) |
| 系统的技术选型、模块划分、部署架构 | [`arch/01整体架构设计.md`](./arch/01整体架构设计.md) |
| 数据模型、字段映射、数据库表结构 | [`arch/02数据存储设计.md`](./arch/02数据存储设计.md) |
| Agent 如何读取和操作资源、CLI/REST 接口设计 | [`arch/03Agent交互架构.md`](./arch/03Agent交互架构.md) |
| `.m2`/`.blp` 渲染与 3D 预览方案 | [`arch/04模型与贴图渲染架构.md`](./arch/04模型与贴图渲染架构.md) |
| 测试分层、fixtures、CI 流程 | [`arch/05测试策略.md`](./arch/05测试策略.md) |
| DBC 维护职责划分、补丁生成与部署同步 | [`arch/07DBC维护与同步方案.md`](./arch/07DBC维护与同步方案.md) |
| 坐骑/宠物/NPC 所需的 DBC 文件、字段与 SQL 实现清单 | [`references/06资源DBC与SQL实现参考.md`](./references/06资源DBC与SQL实现参考.md) |
| 开发阶段划分与验收标准 | [`plan/开发计划.md`](./plan/开发计划.md) |

## 流程文档与代码的对应关系

流程的步骤目录在三个地方保持一致，改动任意一处都要同步另外两处
（`backend/tests/unit/test_flow_steps.py` 会断言它们不漂移）：

| 位置 | 内容 |
|---|---|
| `docs/workflows/01坐骑生产流程总纲.md` | 人类可读的流程说明与各步锚点 |
| `backend/app/schemas/flow.py` | `FLOW_STEP_IDS` —— 步骤 id 列表与状态推导 |
| `apps/web/src/features/resources/lib/patch-flow.ts` | `PATCH_FLOW_STEPS` —— 前端步骤目录 |

## 相关项目

- `wow-dbc`（原始 DBC 仓库）：`data/wow-dbc`
- `wow-dbc-tool`：`tools/wow-dbc-tool`
- `wow-mpq-cli`：`tools/wow-mpq-cli`
- `acore-deploy`：`/Users/deadwalk/Workspace/acore-deploy`
