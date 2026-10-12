# 文档目录

本目录存放 `acore-resouces` 资源管理系统的需求与设计方案，参考 SquadSight 的文档组织方式，分为 **需求（requirement）**、**架构（arch）** 两大类。

## 文档结构

```
docs/
├── requirement/                    # 需求文档：只描述“做什么”
│   └── 资源管理系统需求v1.0.md
├── arch/                           # 架构文档：描述“怎么做”
│   ├── 01整体架构设计.md
│   ├── 02数据存储设计.md
│   ├── 03Agent交互架构.md
│   ├── 04模型与贴图渲染架构.md
│   ├── 05测试策略.md
│   └── 07DBC维护与同步方案.md
├── plan/                           # 开发计划与专项方案
│   └── 开发计划.md
├── prototypes/                     # 早期 HTML 原型（历史参考）
├── references/                     # 参考资料
│   └── 06资源DBC与SQL实现参考.md
├── workflows/                      # 操作流程手册
│   ├── 01坐骑补丁端到端流程手册.md
│   ├── 02多人骑乘坐骑制作流程.md
│   ├── 03水面行走坐骑制作流程.md
│   ├── 04水下骑乘坐骑制作流程.md
│   ├── 05骑乘采集坐骑制作流程.md
│   ├── 06变色涂装坐骑制作流程.md
│   ├── 07自带拍卖行坐骑制作流程.md
│   └── 08自带商人修理坐骑制作流程.md
└── README.md                       # 本文件
```

## 快速导航

| 你想了解什么 | 阅读文档 |
|-------------|---------|
| 系统需要实现哪些功能 | [`requirement/资源管理系统需求v1.0.md`](./requirement/资源管理系统需求v1.0.md) |
| 系统的技术选型、模块划分、部署架构 | [`arch/01整体架构设计.md`](./arch/01整体架构设计.md) |
| 数据模型、字段映射、数据库表结构 | [`arch/02数据存储设计.md`](./arch/02数据存储设计.md) |
| Agent 如何读取和操作资源、CLI/REST 接口设计 | [`arch/03Agent交互架构.md`](./arch/03Agent交互架构.md) |
| `.m2`/`.blp` 渲染与 3D 预览方案 | [`arch/04模型与贴图渲染架构.md`](./arch/04模型与贴图渲染架构.md) |
| 测试分层、fixtures、CI 流程 | [`arch/05测试策略.md`](./arch/05测试策略.md) |
| DBC 维护职责划分、补丁生成与部署同步 | [`arch/07DBC维护与同步方案.md`](./arch/07DBC维护与同步方案.md) |
| 坐骑/宠物/NPC 所需的 DBC 文件、字段与 SQL 实现清单 | [`references/06资源DBC与SQL实现参考.md`](./references/06资源DBC与SQL实现参考.md) |
| 从编辑坐骑到发布 MPQ 的端到端操作手册 | [`workflows/01坐骑补丁端到端流程手册.md`](./workflows/01坐骑补丁端到端流程手册.md) |
| 双人/三人乘客坐骑制作 | [`workflows/02多人骑乘坐骑制作流程.md`](./workflows/02多人骑乘坐骑制作流程.md) |
| 特殊功能坐骑制作（水面行走/水下骑乘/骑乘采集/变色涂装/拍卖行/商人修理） | [`workflows/`](./workflows) 03–08 各篇 |
| 开发阶段划分与验收标准 | [`plan/开发计划.md`](./plan/开发计划.md) |

## 相关项目

- `wow-dbc`（原始 DBC 仓库）：`data/wow-dbc`
- `wow-dbc-tool`：`tools/wow-dbc-tool`
- `wow-mpq-cli`：`tools/wow-mpq-cli`
- `acore-deploy`：`/Users/deadwalk/Workspace/acore-deploy`
