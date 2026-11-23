---
name: verify-model
description: >
  离线验证模型资源（坐骑/小宠物/NPC），把「模型发白、贴图缺失、坐骑不出现、
  数据未落地」等问题挡在游戏客户端之前。覆盖三层：verify mounts 静态闭包审计、
  verify db 测试服落地比对、preview 渲染链端到端检查（M2 元数据 → 文件流 →
  BLP 解码 → 前端代理）。改 YAML/DBC/SQL/MPQ 后、补丁发布前必跑。
argument-hint: [mount|pet|npc] [resource-id-or-model-folder]
allowed-tools: [Read, Bash, Grep, Glob]
model: sonnet
---

# /verify-model

离线闭环验证模型资源，验证反馈周期远短于开 Windows 客户端。三层各挡一类问题：

| 层 | 工具 | 挡什么 | 适用类型 |
|----|------|--------|----------|
| A 静态闭包审计 | `verify mounts` CLI | 白模、贴图缺失、模型链断裂 | **仅 mount** |
| B 落地比对 | `verify db` CLI | SQL/DBC 改动没真正进测试服 | **仅 mount** |
| C 渲染链 E2E | preview API + curl | 元数据损坏、文件流断裂、贴图解不出来 | mount / pet / npc |

## 执行流程

### 0. 前置：确认服务在运行

后端 `:8000`、前端 Vite `:5173` 由**用户**启动（不要自己起服务）。先探测：

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/system/health 2>/dev/null
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null
```

没起就告诉用户启动命令（backend: `cd backend && uv run uvicorn app.main:app --port 8000`；web: `cd apps/web && npm run dev`），只跑层 A/B，层 C 等服务可用。

### 1. 层 A：静态闭包审计（仅 mount）

```bash
cd backend
uv run python -m app.cli verify mounts                  # 全量
uv run python -m app.cli verify mounts --id 466         # 单只
uv run python -m app.cli verify mounts --json           # 机读输出
```

审计链：YAML → CreatureModelData.ModelName → CreatureDisplayInfo(TextureVariation_1/2/3) → M2 贴图表(type 0 硬编码 / type 11,12,13 替换槽) → 模型目录 .blp。
退出码：0 = 无阻断问题，1 = 有阻断问题，2 = 校验过程失败。

### 2. 层 B：测试服落地比对（仅 mount）

```bash
cd backend && uv run python -m app.cli verify db
```

比对 YAML 声明的 `creature_template` / `creature_model_info` / `item_template` / `creature_template_model` 行是否真的在 `acore_world` 里。
退出码：0 = 全部落地，1 = 有缺失，2 = 数据库不可用（docker 测试服没起）。

### 3. 层 C：渲染链端到端（mount / pet / npc 通用）

对每只待验证资源，取 `data/resources/{mounts|pets|npcs}/` 下 YAML 的 `model_folder`，依次打：

```bash
# C1 模型元数据（resource_type 可省略，服务端按 mounts/pets/npcs 目录自动探测）
curl -s "http://localhost:8000/api/preview/model/<model_folder>" | python3 -m json.tool
```

检查点：`status=available`（否则 skin_missing/not_found）、`partial=false`、
`vertices_count>0`、`animations_count>0`、`skin_files` 非空、`textures` 无空文件名的 type 0 槽。

```bash
# C2 M2 文件流 —— 路径必须是项目根相对完整路径（即 C1 返回的 main_m2 原样回传）
curl -s -o /tmp/v.bin -w "%{http_code} %{size_download}\n" \
  "http://localhost:8000/api/preview/m2/<model_folder>/file/<main_m2>"
head -c 4 /tmp/v.bin    # 必须是 MD20
```

检查点：HTTP 200；`size_download` == C1 的 `metadata.file_size`；魔数 `MD20`。
注意：传短路径（只有 folder 内相对路径）会 404——这是设计行为，`relative_path` 解析为 `project_root / raw`。

```bash
# C3 skin 文件流（路径取 C1 的 skin_files 原样值，抽 1 个即可）
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" \
  "http://localhost:8000/api/preview/m2/<model_folder>/file/<skin_path>"

# C4 BLP 贴图解码（优先验 TextureVariation_1 引用的贴图；路径取 blp_files 原样值）
curl -s -o /tmp/v.img -w "%{http_code} %{content_type} %{size_download}\n" \
  "http://localhost:8000/api/preview/blp/<blp_path>"
file /tmp/v.img         # 期望 RIFF...Web/P
```

```bash
# C5 前端代理链（确认 Vite → backend 打通）
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5173/api/preview/model/<model_folder>"
```

服务端全部通过后，**浏览器最终成像由用户确认**（不要自己开浏览器/截图），给 URL：
`http://localhost:5173/preview/<mount|pet|npc>/<resource_id>`

### 4. 汇总报告

按资源逐只汇总：层 A error/warning 明细、层 B 缺失行、层 C 各环节状态、
用户浏览器确认 URL。error 为 0 才算通过；有 error 时先修再验，别带着阻断问题进客户端。

## 判定规则（改审计逻辑或人工裁决时别踩）

- 只有**被 skin batch 引用**的贴图槽缺失才是 error；未引用的降为 warning。
  引用链：skin batch.textureLookup（第 9 个 uint16，字节偏移 16）→ M2.textureLookups → M2.textures。
- type 11/12/13 替换槽：CreatureDisplayInfo 的 `TextureVariation_N` 优先；槽空时回退 M2 自带文件名；两者都空才算问题。
- .blp 存在性检查走**大小写不敏感**目录索引（客户端大小写不敏感、本地文件系统敏感）。
- 同模型 + 不同贴图变体 = 合法（项目规则：新坐骑用贴图变体区分）；同模型可分给多只资源，不算冲突。
- 审计引擎已用 ground truth 校验：`brontosaurusmount.m2`（贴图槽被清空）判 error、`brontosauruspack.m2`/`brontosaurus.m2` 判干净 → 「被引用的 type 0 槽文件名为空」= 真白模，判定可信。
- **「已在库里」≠「功能已上线」**：`creature_template.VehicleId` 悬空时 AC `CreateVehicleKit` **静默返回 false**、日志无提示 → 多人骑乘必须显式核对 vehicle 块 + `vehicle_template_accessory` / `npc_spellclick_spells` 行。
- 改已构建过的资源必须 `patch build --force`：SQL 生成按 `item_template.entry` 去重，已存在的会整只跳过；不加 force DBC 记录也会冲突。

## 已知边界

- 层 A/B 当前**仅支持 mount**（`app/cli/verify.py` 只接 `list_resources("mount")`）；pet/npc 只跑层 C，审计服务扩展前不要假装能审计。
- `patch db-apply` 本机不可用（db-import 镜像构建失败）→ SQL 导入用手工 `docker exec -i -e MYSQL_PWD=<密码> acore-mysql mysql -h127.0.0.1 -uacore_test acore_world < <sql>`。
- `acore_world.updates` 的 hash 不可信（本地重新生成即失配），**只有 `name` 列是「是否已导入」的可靠信号**。
- 本地没有 3.3.5a 原版文件清单 → 贴图引用指向原版资源时，无法区分「缺失」和「原版自带」，这类报缺失先核对是否原版路径再下结论。
- 层 C 读的是 `sources/` 原始文件（与 MPQ 打包同源），不能替代「MPQ 打包正确性 + 客户端实际加载」两步——发布前仍要走 `mpqcli list` 抽查和用户客户端实测。
- 模型贴图槽损坏（type 0 名称被清零）的修复配方与不可修复案例（如 shreddermount.m2）见记忆 `project_mount_verification_loop.md`。
- SQL 文件头带 `-- Date:` 行，每次重建内容必变 → updates 表 hash 必失配，属预期现象，不是问题。

## 示例

```
/verify-model                        # 全部坐骑三层验证
/verify-model mount 466              # 单只坐骑全链路
/verify-model mount                  # 全量审计 + 抽样渲染链
/verify-model pet 12                 # 小宠物渲染链（层 A/B 不支持，自动只跑层 C）
```
