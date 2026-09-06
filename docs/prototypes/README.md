# UI 原型图（参考存档）

> **状态**：本目录为早期 HTML 静态原型，**仅作历史参考，不再维护**。正式前端实现位于 [`apps/web/`](../../apps/web/)，使用 React 18 + TypeScript + Vite + Tailwind CSS + Three.js 构建，UI 与功能均以 `apps/web` 为准。本 README 记录原型与当前实现的对应关系及已知差异，作为阅读原型时的对照依据（最后同步：2026-09-06）。

本目录包含 `acore-resouces` 资源管理系统在正式开发前端之前的 HTML 交互原型图，用于确认页面结构、信息架构与交互流程。

## 页面清单

| 页面 | 原型文件 | 正式实现（`apps/web/src/`） | 状态 |
|------|---------|---------------------------|------|
| 仪表盘 | [index.html](index.html) | `pages/DashboardPage.tsx` + `features/resources/lib/dashboard-stats.ts` | 实现已重构为坐骑筛选统计看板（星级/类型/添加状态分布），与原型差异较大 |
| 资源列表 | [resources.html](resources.html) | `pages/ResourceListPage.tsx` | 实现新增必填字段缺失快捷筛选与行内徽章 |
| 资源详情 | [resource-detail.html](resource-detail.html) | `pages/ResourceDetailPage.tsx` + `components/form/` | 实现新增编辑态校验（必填空值红框、数字输入类型校验） |
| 导入资源 | [import.html](import.html) | `pages/PlaceholderPage.tsx`（占位页，xlsx 导入通过 CLI `xlsx import`） | 原型仅存档，暂不实现 |
| 导出补丁 | [export.html](export.html) | `pages/ExportPage.tsx` + `features/resources/components/patch-export/` | 原型为早期单步设计；实现为完整链路（多选创建任务 → dry-run/正式构建 → 发布 → 任务列表） |
| 资源预览 | [preview.html](preview.html) | `pages/PreviewPage.tsx` + `components/viewer/`（ModelViewer / TextureViewer / AssetFileTree） | 基本一致 |
| 设置 | [settings.html](settings.html) | `pages/SettingsPage.tsx` + `shared/system.ts` | 原型为可编辑配置表单；实现为只读系统信息（路径配置、资源计数、健康检查） |

> 上表中"正式实现"列为大致对应关系，实际文件结构以 `apps/web/src/` 当前状态为准。

## 使用方式

直接用浏览器打开任意 HTML 文件即可查看。原型页面之间通过导航和按钮相互跳转。

## 设计说明

- 采用深色主题，参考 SquadSight 的文档组织与视觉风格。
- 所有图标使用内联 SVG，无需额外依赖。
- 样式统一在 [styles.css](styles.css) 中维护。
- 正式实现改用 [lucide-react](https://lucide.dev/) + Tailwind CSS 自定义薄组件。

## 与正式实现的主要差异

原型反映的是早期设计，与正式实现存在以下关键差异：

- **补丁工作流**：原型展示的是单步导出；实现拆分为 `patch export → patch build → patch publish` 三段式，且已在 Web 导出页提供完整可视化链路（构建支持 dry-run 与 force，构建状态轮询，见 [Agent 交互架构](../arch/03Agent交互架构.md)）。
- **模型渲染**：原型仅展示静态预览；实现使用 Three.js + `@react-three/fiber` 直接在浏览器解析并渲染 M2（见 [模型与贴图渲染架构](../arch/04模型与贴图渲染架构.md)）。
- **DBC 真相源**：通过 `data/wow-dbc` git 子模块维护，SQL 按资源分片写入 `data/sql/azerothcore-updates/mounts/` 并通过软链接同步到 AzerothCore（见 [DBC 维护与同步方案](../arch/07DBC维护与同步方案.md)）。
- **设置页**：原型为可编辑配置；实现按"配置即代码"原则只读展示后端环境配置，不做在线修改。

## 相关文档

- [整体架构设计](../arch/01整体架构设计.md)
- [Agent 交互架构](../arch/03Agent交互架构.md)
- [模型与贴图渲染架构](../arch/04模型与贴图渲染架构.md)
- [DBC 维护与同步方案](../arch/07DBC维护与同步方案.md)
