# UI 原型图（参考存档）

> **状态**：本目录为早期 HTML 静态原型，**仅作历史参考**。正式前端实现位于 [`apps/web/`](../../apps/web/)，使用 React 18 + TypeScript + Vite + shadcn/ui + Tailwind CSS + Three.js 构建，UI 与功能均以 `apps/web` 为准。

本目录包含 `acore-resouces` 资源管理系统在正式开发前端之前的 HTML 交互原型图，用于确认页面结构、信息架构与交互流程。原型已完成使命，不再维护。

## 页面清单

| 页面 | 原型文件 | 正式实现（`apps/web/src/`） |
|------|---------|---------------------------|
| 仪表盘 | [index.html](index.html) | `pages/DashboardPage.tsx` |
| 资源列表 | [resources.html](resources.html) | `pages/ResourceListPage.tsx` |
| 资源详情 | [resource-detail.html](resource-detail.html) | `pages/ResourceDetailPage.tsx` + `components/form/` |
| 导入资源 | [import.html](import.html) | `pages/PlaceholderPage.tsx`（尚未独立实现，xlsx 导入通过 CLI） |
| 导出补丁 | [export.html](export.html) | `features/resources/components/BulkPatchExportButton.tsx` + `usePatchJobs` |
| 资源预览 | [preview.html](preview.html) | `pages/PreviewPage.tsx` + `components/viewer/`（ModelViewer / TextureViewer / AssetFileTree） |
| 设置 | [settings.html](settings.html) | `pages/PlaceholderPage.tsx`（尚未独立实现） |

> 上表中"正式实现"列为大致对应关系，实际文件结构以 `apps/web/src/` 当前状态为准。

## 使用方式

直接用浏览器打开任意 HTML 文件即可查看。原型页面之间通过导航和按钮相互跳转。

## 设计说明

- 采用深色主题，参考 SquadSight 的文档组织与视觉风格。
- 所有图标使用内联 SVG，无需额外依赖。
- 样式统一在 [styles.css](styles.css) 中维护。
- 正式实现改用 [lucide-react](https://lucide.dev/) + Tailwind CSS，主题与配色由 shadcn/ui token 控制。

## 与正式实现的差异点

原型反映的是早期设计，与正式实现存在以下关键差异：

- **补丁工作流**：原型展示的是单步导出；正式实现拆分为 `patch export → patch build → patch publish` 三段式（见 [Agent 交互架构](../arch/03Agent交互架构.md)）。
- **模型渲染**：原型仅展示静态预览；正式实现使用 Three.js + `@react-three/fiber` 直接在浏览器解析并渲染 M2，无需 glTF 中间格式（见 [模型与贴图渲染架构](../arch/04模型与贴图渲染架构.md)）。
- **模型转换工具**：原型 `settings.html` 提到的 Rust `model-converter` 已废弃，改为前端原生渲染。
- **DBC 真相源**：通过 `data/wow-dbc` git 子模块维护，SQL 通过 `data/sql/azerothcore-updates` 软链接同步到 AzerothCore（见 [DBC 维护与同步方案](../arch/07DBC维护与同步方案.md)）。

## 相关文档

- [整体架构设计](../arch/01整体架构设计.md)
- [Agent 交互架构](../arch/03Agent交互架构.md)
- [模型与贴图渲染架构](../arch/04模型与贴图渲染架构.md)
- [DBC 维护与同步方案](../arch/07DBC维护与同步方案.md)
