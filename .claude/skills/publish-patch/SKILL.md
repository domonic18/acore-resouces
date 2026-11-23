---
name: publish-patch
description: >
  两层发布已构建的坐骑补丁：先 patch publish 本地发布到 workspace/dist/
  （可反悔），再 patch distro-push 推送到分发端（不可逆，玩家可见）。
  包含补丁编号规则（必须显式指定且避开官方 5 号）、发布状态核对与
  分发端下线/改号入口。
argument-hint: [--batch <批次>] [--start-number N] [--push]
allowed-tools: [Read, Bash]
model: sonnet
---

# /publish-patch

发布已构建的坐骑补丁 MPQ。**发布分两层，是两个独立动作**：

| 动作 | 命令 | 可逆性 | 效果 |
|------|------|--------|------|
| 本地发布 | `patch publish` | ✅ 可反悔（只是改名移位到 dist/） | 任务 status → `applied` |
| 推送分发端 | `patch distro-push` | ❌ **不可逆** | 补丁对玩家可见、公告同步发布 |

## ⚠️ 编号规则（先读这里）

- `--start-number` **默认 5，而客户端 `Data/zhCN/` 已有官方 `patch-zhCN-5.mpq`**——
  2026-11-22 曾发生新补丁重复领到 5 号、放进客户端即覆盖官方文件的事故。
- **永远显式传 `--start-number`**，取值必须：
  1. 大于官方补丁最大号（zhCN 客户端为 5，即 ≥ 6）；
  2. 大于分发端已在推的所有批次的最大编号（MPQ 同号整文件覆盖，编号大的胜出）。
- 查分发端现有编号：

```bash
curl -s http://localhost:8000/api/patches/distro/status | python3 -m json.tool
# pushed_details 里带每个批次的 patch_number；安全取值 = 最大编号 + 1
```

## 输入格式

- `--batch <时间戳>`：只发布指定批次（**推荐始终指定**，避免把 workspace/mpq/ 里
  遗留旧批次一起编进低编号发出去）；可重复传多个。
- `--start-number N`：补丁编号起始值（必传，见上）。
- `--push`：本地发布后立即推送分发端（等效 publish + distro-push，跳过中间确认）。
- 无参数时发布 `workspace/mpq/` 下所有未发布批次——**慎用**，先用
  `ls workspace/mpq/` 确认没有夹带旧批次。

## 执行流程

### 0. 前置检查

- 确认验证已通过：补丁内资源跑过 `/verify-model`（至少层 A 静态审计无 error）。
- 确认批次内含哪些任务：`cd backend && uv run python -m app.cli patch list`。
- 确认没有夹带旧批次：`ls workspace/mpq/`。

### 1. 本地发布（可反悔）

```bash
cd backend
uv run python -m app.cli patch publish --batch <批次时间戳> --start-number <N>
# 预览不执行：加 --dry-run
```

效果：`workspace/mpq/<批次>/patch-mounts.mpq` → 移动改名为
`workspace/dist/<批次>/patch-zhCN-<N>.mpq`（manifest/readme/changelog 随附），
参与任务 status → `applied`。改编号可反悔重发（见「下线/改号」）。

### 2. 推送分发端（不可逆——推送前必须向用户确认）

```bash
cd backend
uv run python -m app.cli patch distro-push --batch <批次时间戳>
```

推送成功后**自动删除本地 dist 的 MPQ 副本**（保留 manifest/changelog/readme）——
分发端是玩家下载源，本地留一份是 300MB+ 的双份存储；**推送失败时本地副本保留**，
那是重试的唯一来源。推送不去重，payload 编号从 dist manifest 读取。

### 3. 核对发布状态

```bash
# 对比「本地已发布」与「分发端已推送」，发现漏推批次
curl -s http://localhost:8000/api/patches/distro/status | python3 -m json.tool
```

## 下线 / 改号（分发端已推送的批次）

| 需求 | 入口 |
|------|------|
| 从分发端下线批次 | `DELETE /api/patches/distro/batches/{batch}` |
| 修改分发端元数据（含改号） | `PATCH /api/patches/distro/batches/{batch}` |
| 改号完整语义 | 删分发端批次 → 本地改 MPQ 文件名与 dist manifest 的 `patch_number`/`patch_file` → 重推 |
| 只清本地 MPQ 文件（元数据保留，任务退回待构建） | Web `/mpq` 页 |

## 失败处理

- **无批次可发布**：`workspace/mpq/ 中没有可发布的批次` → 先跑 build。
- **批次缺少 MPQ**：报错并跳过该批次。
- **本地发布失败**：dist 侧不完整（判定未发布），重跑自愈。
- **推送失败**：本地 MPQ 副本保留，排查网络/分发端后用同一 `--batch` 重推。

## 依赖

- `uv`（backend 环境）
- `workspace/mpq/` 下已构建批次（由 `/build-mount-patch` 产出）
- 分发端容器 `acore-patch-distro-web` 在运行（推送时）

## 示例

```
/publish-patch --batch 20261123_043339 --start-number 7
/publish-patch --batch 20261123_043339 --start-number 7 --push
/publish-patch --dry-run
```
