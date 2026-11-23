# acore-resouces Frontend - Claude Code AI 上下文文件

> 本目录的规则是对项目根 [CLAUDE.md](../../CLAUDE.md) 通用规则的补充。请先阅读根目录的通用规则。

## 1. 技术栈

- **框架**: React 18.3+
- **语言**: TypeScript 5.3+
- **构建工具**: Vite 5.0+
- **样式**: Tailwind CSS 3.4+ + 项目自建语义 CSS 类
- **状态管理**: TanStack Query 5+
- **3D 渲染**: Three.js 0.160+ / @react-three/fiber / @react-three/drei
- **HTTP 客户端**: 原生 fetch（`src/shared/api.ts`）+ TanStack Query
- **图标**: lucide-react

> **没有引入 shadcn/ui**。依赖里只有 `@radix-ui/react-tooltip`（仅用于 TooltipProvider）。
> 通用组件原语在 `src/shared/components/ui/`（`Dialog` / `Badge`），
> 其余组件用 `src/index.css` + `src/prototype.css` 里的语义类。

## 2. 项目结构

```
apps/web/src/
├── app/                  # 路由与入口
│   └── router.tsx        # createBrowserRouter，唯一的路由表
├── features/
│   ├── resources/        # 资源业务（列表 / 详情 / 补丁导出）
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/          # 业务常量与纯函数
│   ├── dbc/              # DBC 查看器
│   └── mpq/              # MPQ 查看器
├── shared/
│   ├── components/ui/    # 通用原语（Dialog / Badge / LogoIcon）
│   ├── types.ts          # 后端模型的 TS 镜像（手工维护）
│   ├── api.ts            # fetch 封装
│   └── utils.ts          # cn / uniqueFiles
├── components/           # 跨 feature 的通用组件（badges / form / table / cards）
├── pages/                # 页面组件
└── index.css / prototype.css   # 设计 token 与语义类
```

## 3. 开发命令

```bash
npm install
npm run dev          # 开发服务器
npm run build        # tsc && vite build
npm run type-check   # tsc --noEmit
npm run lint         # eslint，--max-warnings 0
npm run format       # prettier --write
```

> **没有 `npm run test`**——前端尚未引入 vitest，UI 行为依赖人工与桌面端实测。

## 4. 前端规范

### 组件组织

- 一个组件一个文件，函数组件，文件名 PascalCase。
- 业务组件放 `features/<业务>/`，跨业务的通用组件放 `components/`，
  与业务无关的通用原语放 `shared/components/ui/`。
- 组件超过 300 行考虑拆分。

### 类型安全

- 所有 props、state、API 响应使用 TypeScript 类型，优先 `interface`。
- **不使用 `any`**。后端模型在 `src/shared/types.ts` 手工镜像，字段名保持
  后端的 snake_case（如 `common_value`），不要在前端改成 camelCase。
- API 客户端函数集中在 `src/shared/*.ts`（按域分文件），组件不直接写 fetch。

### 样式

- 优先用 Tailwind 工具类；需要复用的视觉模式用 `index.css` 的语义类
  （`.btn` / `.card` / `.badge` / `.data-table` / `.form-input` …）。
- 颜色一律走设计 token（`index.css` 的 CSS 变量 + `tailwind.config.ts` 的映射），
  不要写死十六进制。
- 新增语义类时同步在 `index.css` 里定义，并补上对应的 Tailwind 映射。

### 状态与数据获取

- 服务端状态一律用 TanStack Query（`useQuery` / `useMutation`）。
- 查询 hook 放在 `features/<业务>/hooks/`，错误处理在 hook 层收敛。
- 轮询：构建进度用 `refetchInterval`（运行中 2s，停了自动停）。

### UI 约定

- **通用原语优先**：对话框用 `<Dialog>`（自带 ESC / 遮罩关闭 / 滚动锁），
  徽标用 `<Badge tone="...">`。不要再手写 `fixed inset-0 z-50` 的遮罩层。
- **四态齐全**：每个数据区域都要有 loading / empty / error / success 四种表现，
  空态用 `.empty-state`，错误用 `.badge-danger` 风格的边框条。
- **多步流程**：用 `<StepIndicator steps={...} current={n} />`，
  步骤从 `patch-flow.ts` 之类的**单一常量**取，不要在组件里硬编码步骤数组。
- **文案硬编码中文**，项目没有 i18n 框架；不要引入。
- 图标统一用 lucide-react，不要混用字符图标。

### 3D 渲染

- `ModelViewer` 使用 `@react-three/fiber` + `@react-three/drei`，
  前端原生解析 M2/skin 二进制并直接构建 `THREE.Group` 渲染（不经过 glTF 中间格式）。
- 渲染失败时自动降级为 `AssetFileTree` + `TextureViewer`。
- 高清贴图异步加载，避免阻塞首屏。

## 5. 任务完成后检查清单

1. **类型检查**：`npm run type-check`
2. **构建验证**：`npm run build`
3. **代码质量**：`npm run lint`
4. **验证**：在浏览器中测试功能正常（不要只看编译通过）
