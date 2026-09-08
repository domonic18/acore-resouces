---
name: publish-patch
description: >
  将 workspace/mpq/ 下已构建的 MPQ 批次发布到 workspace/dist/，
  并重命名为魔兽世界客户端补丁命名方式 patch-zhCN-{number}.mpq。
argument-hint: [--start-number N] [--dry-run]
allowed-tools: [Read, Edit, Write, Bash]
model: sonnet
---

# /publish-patch

发布已构建的坐骑补丁 MPQ 到分发目录，供客户端下载使用。

## 输入格式

- 无参数：自动发布所有未发布的批次。
- `--start-number N`：指定补丁编号起始值（默认 5）。
- `--dry-run`：仅预览，不执行发布。

## 执行流程

### 1. 定位 MPQ 批次

扫描 `workspace/mpq/` 下包含 `patch-*.mpq` 的目录。

### 2. 调用发布命令

```bash
cd backend
uv run python -m app.cli patch publish
```

指定起始编号：

```bash
cd backend
uv run python -m app.cli patch publish --start-number 5
```

干跑预览：

```bash
cd backend
uv run python -m app.cli patch publish --dry-run
```

### 3. 输出产物

每个批次会发布到 `workspace/dist/{batch_name}/`（移动语义：MPQ 移动改名、
manifest/readme 等元数据随附复制，发布成功后清理构建侧批次目录）：

```text
workspace/dist/
└── 20260724_123045/
    ├── patch-zhCN-5.mpq
    ├── manifest.json
    └── readme.txt
```

## 失败处理

- **无批次可发布**：命令提示 `workspace/mpq/ 中没有可发布的批次。`
- **批次缺少 MPQ 文件**：报错并跳过该批次。
- **发布失败**：dist 侧不完整（判定未发布），重跑发布可自愈。

## 依赖

- `uv`（backend 环境）
- `workspace/mpq/` 下已构建的 MPQ 批次

## 示例

```
/publish-patch
/publish-patch --start-number 10
/publish-patch --dry-run
```
