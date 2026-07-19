# acore-resouces Frontend - Claude Code AI 上下文文件

> 本目录下的规则是对项目根目录 [CLAUDE.md](../CLAUDE.md) 通用规则的补充。请先阅读根目录的通用规则。

## 1. 技术栈

- **框架**: React 18.3+
- **语言**: TypeScript 5.3+
- **构建工具**: Vite 5.0+
- **UI 组件**: shadcn/ui + Tailwind CSS 3.4+
- **状态管理**: TanStack Query 5+
- **3D 渲染**: Three.js 0.160+ / @react-three/fiber / @react-three/drei
- **HTTP 客户端**: 原生 fetch 或 tanstack-query 配套方案

## 2. 项目结构

```
apps/web/src/
├── features/          # mounts / pets / npcs 业务模块
├── shared/            # API hooks、工具函数、通用组件
├── components/viewer/ # TextureViewer、ModelViewer、AssetFileTree
├── pages/             # 页面组件
└── app/               # 应用入口、路由、全局配置
```

## 3. 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 生产构建
npm run build

# 类型检查
npm run type-check

# 运行测试
npm run test

# 代码格式化
npm run format

# Lint
npm run lint
```

## 4. 前端规范

### 组件组织

- 每个组件一个文件，默认使用函数组件。
- 组件文件名使用 PascalCase。
- 业务组件按 `features/{mounts,pets,npcs}/` 组织。
- 通用组件和 hooks 放在 `shared/`。

### 类型安全

- 所有 props、state、API 响应使用 TypeScript 类型。
- 优先使用接口（interface）定义对象结构。
- 避免使用 `any`。

### 样式

- 使用 Tailwind CSS 进行样式开发。
- shadcn/ui 组件按需安装，避免全量引入。
- 自定义主题配置在 `tailwind.config.ts` 中维护。

### API 交互

- 使用 TanStack Query 管理服务端状态。
- API 基础 URL 通过环境变量配置，开发模式默认指向 `http://localhost:8000`。
- 错误处理统一在 hooks 层封装。

### 3D 渲染

- `ModelViewer` 使用 `@react-three/fiber` + `@react-three/drei` 加载 glTF。
- 转换失败时自动降级为 `AssetFileTree` + `TextureViewer`。
- 高清贴图异步加载，避免阻塞首屏。

## 5. 任务完成后检查清单

完成前端编码任务后：

1. **类型检查**：`npm run type-check`
2. **构建验证**：`npm run build`
3. **测试**：`npm run test`
4. **代码质量**：`npm run lint` + `npm run format`
5. **验证**：在浏览器中测试功能正常
