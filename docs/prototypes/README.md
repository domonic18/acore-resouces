# UI 原型图

本目录包含 `acore-resouces` 资源管理系统的 HTML 交互原型图，用于在正式开发前端之前确认页面结构、信息架构与交互流程。

## 页面清单

| 页面 | 文件 | 说明 |
|------|------|------|
| 仪表盘 | [index.html](index.html) | 资源统计、最近更新、快速操作入口 |
| 资源列表 | [resources.html](resources.html) | 坐骑/宠物/NPC 列表、筛选、分页 |
| 资源详情 | [resource-detail.html](resource-detail.html) | 资源编辑、DBC/DB 配置、模型预览、文件树 |
| 导入资源 | [import.html](import.html) | xlsx 导入、dry-run 预览、导入日志 |
| 导出补丁 | [export.html](export.html) | DBC/SQL 补丁导出、diff 预览、历史导出 |
| 资源预览 | [preview.html](preview.html) | 3D 模型查看器、贴图变体、文件树、元数据 |
| 设置 | [settings.html](settings.html) | 目录配置、模型转换工具、导出默认配置 |

## 使用方式

直接用浏览器打开任意 HTML 文件即可查看。页面之间通过导航和按钮相互跳转。

## 设计说明

- 采用深色主题，参考 SquadSight 的文档组织与视觉风格。
- 所有图标使用内联 SVG，无需额外依赖。
- 样式统一在 [styles.css](styles.css) 中维护。

## 对应需求

原型覆盖《资源管理系统需求 v1.0》中的以下功能：

- 资源浏览与检索
- 资源元数据编辑
- xlsx 批量导入
- DBC/SQL 补丁导出
- 模型与贴图预览
- 系统配置
