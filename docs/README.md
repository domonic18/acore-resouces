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
│   └── 03Agent交互架构.md
└── README.md                       # 本文件
```

## 快速导航

| 你想了解什么 | 阅读文档 |
|-------------|---------|
| 系统需要实现哪些功能 | [`requirement/资源管理系统需求v1.0.md`](./requirement/资源管理系统需求v1.0.md) |
| 系统的技术选型、模块划分、部署架构 | [`arch/01整体架构设计.md`](./arch/01整体架构设计.md) |
| 数据模型、字段映射、数据库表结构 | [`arch/02数据存储设计.md`](./arch/02数据存储设计.md) |
| Agent 如何读取和操作资源、CLI 接口设计 | [`arch/03Agent交互架构.md`](./arch/03Agent交互架构.md) |

## 相关项目

- `wow-dbc-tool`：`/Users/deadwalk/Workspace/acore-deploy/wow-dbc/tools/wow-dbc-tool`
- `acore-deploy`：`/Users/deadwalk/Workspace/acore-deploy`
