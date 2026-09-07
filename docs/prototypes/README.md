# UI 原型图

> **状态**：本目录为 HTML 静态原型，已与正式实现对齐（最后同步：2026-09-07，DBC 数据查看已落地，剩余 Phase 4 规划原型：MPQ 查看 / 导出页混淆扩展）。正式前端实现位于 [`apps/web/`](../../apps/web/)，使用 React 18 + TypeScript + Vite + Tailwind CSS + Three.js 构建，UI 与功能均以 `apps/web` 为准。

本目录包含 `acore-resouces` 资源管理系统的 HTML 交互原型图，用于确认页面结构、信息架构与交互流程。

## 页面清单

| 页面 | 原型文件 | 正式实现（`apps/web/src/`） | 状态 |
|------|---------|---------------------------|------|
| 仪表盘 | [index.html](index.html) | `pages/DashboardPage.tsx` + `features/resources/lib/dashboard-stats.ts` | 已对齐：坐骑筛选统计看板（数据来源/类型/星级/添加/调试/健康分布卡） |
| 资源列表 | [resources.html](resources.html) | `pages/ResourceListPage.tsx` + `features/resources/components/ResourceFilters.tsx` | 已对齐：数据来源筛选、必填缺失快捷筛选与行内徽章、状态标签组 |
| 资源详情 | [resource-detail.html](resource-detail.html) | `pages/ResourceDetailPage.tsx` + `components/form/` | 已对齐：编辑态校验（必填空值红框、校验错误汇总） |
| 导出补丁 | [export.html](export.html) | `pages/ExportPage.tsx` + `features/resources/components/patch-export/` | 已对齐：多选创建任务 → dry-run/强制构建 → 发布 → 任务列表完整链路 + 任务删除（操作列，见 [07 §十三](../arch/07DBC维护与同步方案.md)）+ 清理工作区按钮（dry-run 预览 → 确认执行）+ 任务审计视图三栏卡片（DBC before→after / SQL 字段 / MPQ 清单，见 [07 §十二](../arch/07DBC维护与同步方案.md)）；🚧 规划扩展：混淆等级选择（none/basic/encrypted，见 [07 §十四](../arch/07DBC维护与同步方案.md)）、任务操作列的查看 MPQ 入口 |
| 资源预览 | [preview.html](preview.html) | `pages/PreviewPage.tsx` + `components/viewer/`（ModelViewer / TextureViewer / AssetFileTree） | 基本一致 |
| 设置 | [settings.html](settings.html) | `pages/SettingsPage.tsx` + `shared/system.ts` | 已对齐：只读系统信息（数据概览、路径配置、健康检查） |
| DBC 数据查看 | [dbc.html](dbc.html) | `pages/DbcPage.tsx` + `features/dbc/`（hooks / components / lib） | 已对齐：三栏只读查看器（文件列表 + 文件头 badges + 记录分页表格（摘要列可配置 localStorage 持久化 + 首/末页跳转）+ 记录详情面板（25 字段/组折叠 + 字段内搜索）+ 来源资源标注徽章跳转）+ 记录 Diff 对比（对比模式指定 A/B → 字段级对比弹窗：仅差异/全部过滤 + 搜索 + 复制纯文本供外部 AI 分析）；数据修改经资源编辑 + 补丁流程，见 [07 §十五](../arch/07DBC维护与同步方案.md) |
| MPQ 查看 | [mpq.html](mpq.html) | 🚧 规划：`pages/` + `services/mpq_inspector.py`，见 [04 §九](../arch/04模型与贴图渲染架构.md) | 规划中：只读查看器（档案列表含混淆等级徽章 + 层级文件树 + 内容面板按扩展名分发；basic 混淆档案经批次 manifest 回退枚举） |

> 历史原型 `import.html`（xlsx 导入）已随导入链路下线一并删除；未来导入将以模型文件 `.zip` / 模型文件夹为单位（见[需求 v1.0 §3.1.3](../requirement/资源管理系统需求v1.0.md)）。
>
> 上表中"正式实现"列为大致对应关系，实际文件结构以 `apps/web/src/` 当前状态为准。

## 使用方式

直接用浏览器打开任意 HTML 文件即可查看。原型页面之间通过导航和按钮相互跳转。

## 设计说明

- 采用深色主题，参考 SquadSight 的文档组织与视觉风格。
- 所有图标使用内联 SVG，无需额外依赖。
- 样式统一在 [styles.css](styles.css) 中维护。
- 正式实现改用 [lucide-react](https://lucide.dev/) + Tailwind CSS 自定义薄组件。

## 原型与实现的已知差异

- **模型渲染**：原型仅展示静态预览；实现使用 Three.js + `@react-three/fiber` 直接在浏览器解析并渲染 M2（见 [模型与贴图渲染架构](../arch/04模型与贴图渲染架构.md)）。
- **DBC 真相源**：通过 `data/wow-dbc` git 子模块维护，SQL 按资源分片写入 `data/sql/azerothcore-updates/mounts/` 并通过软链接同步到 AzerothCore（见 [DBC 维护与同步方案](../arch/07DBC维护与同步方案.md)）。
- **示例数据**：原型中的计数与分布为快照示例（坐骑 430 / 宠物 107 / NPC 226），实际以 `data/registry.json` 为准。

## 相关文档

- [整体架构设计](../arch/01整体架构设计.md)
- [Agent 交互架构](../arch/03Agent交互架构.md)
- [模型与贴图渲染架构](../arch/04模型与贴图渲染架构.md)
- [DBC 维护与同步方案](../arch/07DBC维护与同步方案.md)
