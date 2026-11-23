---
name: export-mount-jobs
description: >
  根据用户指定的条件从 acore-resouces 资源库中筛选坐骑，
  为指定数量坐骑创建补丁任务（仅写 job.json 元数据）。
  支持按星级、调试状态、已添加状态、坐骑类型等条件组合筛选；
  构建与发布衔接 /build-mount-patch 与 /publish-patch。
argument-hint: [--star <星级>] [--debug <true|false>] [--added <true|false>] [--type <坐骑类型>] [--count N]
allowed-tools: [Read, Bash]
model: sonnet
---

# /export-mount-jobs

按条件筛选坐骑资源，为前 N 个满足条件的坐骑创建补丁任务。
条件可组合使用，**未指定任何条件时不得执行导出**，需向用户确认。

## 输入格式

参数使用 `--key value` 形式，可组合：

- `--star <星级>`：如 `三星`、`四星`、`五星`。
- `--debug <true|false>`：调试通过状态。`false` 表示待调试。
- `--added <true|false>`：是否已标记为 added。
- `--type <坐骑类型>`：如 `陆地坐骑`、`飞行坐骑`、`水上坐骑`。
- `--count N`：导出数量，**默认 5**。

示例：

```text
/export-mount-jobs --star 四星 --debug false --count 5
/export-mount-jobs --type 飞行坐骑 --added false --count 3
/export-mount-jobs --debug false --count 10
```

## 执行流程

### 1. 筛选并创建任务（单段完整脚本，筛选与导出同源）

`patch export` CLI 目前只支持单资源 `--id`，条件筛选暂在 skill 层完成
（未来筛选参数下沉 CLI 后应改回纯 CLI 调用）。以下脚本按用户给出的条件
组装过滤器，**筛选与导出在同一段代码里**，避免两步逻辑漂移：

```bash
cd backend && uv run python -c "
from app.services.resource_store import list_resources
from app.services.patch_exporter import create_patch_job

# —— 按用户条件逐项组装（未在命令行给出的条件不要加）——
STAR  = '四星'        # --star
DEBUG = False         # --debug
ADDED = None          # --added
MTYPE = None          # --type
COUNT = 5             # --count

mounts = list_resources('mount')
if STAR is not None:
    mounts = [m for m in mounts if m.star_rating == STAR]
if DEBUG is not None:
    mounts = [m for m in mounts if m.debug_passed is DEBUG]
if ADDED is not None:
    mounts = [m for m in mounts if m.added is ADDED]
if MTYPE is not None:
    mounts = [m for m in mounts if m.mount_type == MTYPE]

print(f'匹配坐骑总数: {len(mounts)}')
for m in mounts[:COUNT]:
    create_patch_job('mount', m.id)
    print(f'exported mount_{m.id:04d} {m.star_rating} added={m.added} '
          f'{m.official_db.name if m.official_db else m.model_folder}')
"
```

- 匹配数为 0：停止并告知用户，不创建任何任务。
- 创建前会完全重置对应 `mount_{id:04d}` 任务目录，**旧产物会被删除**；
  对已 `applied` 的任务重建需显式指定 job_ids（`patch build --jobs`）。

### 2. 后续构建与发布（衔接 skill）

任务就绪后按用户指令推进，不要默认连跑：

- 构建 → `/build-mount-patch`（先 `--dry-run` 审查计划再正式构建；
  改过已构建坐骑时记得 `--force`）。
- 发布 → `/publish-patch`（必须显式指定 `--start-number`，见该 skill 的编号规则）。
- 构建前建议先跑 `/verify-model` 层 A 审计，白模/贴图缺失问题在构建前挡住。

## 输出产物

- `workspace/patch-jobs/mount_{id:04d}/job.json`：补丁任务（固定目录，仅元数据；
  资源定义构建时现场读取 `data/resources/mounts/*.yaml` 真相源）。
- （衔接步骤产出，见对应 skill）：`workspace/mpq/{timestamp}/`、
  `workspace/dist/{batch}/patch-zhCN-<N>.mpq`、SQL、校验报告。

## 注意事项

- 未指定任何筛选条件时，不得执行导出，需请用户补充条件。
- 导出会重置已有任务目录；`added=true` 的坐骑重复导出没有意义，建议组合
  `--added false` 使用。
- SQL 生成按 `item_template.entry` 去重：历史上已生成过 SQL 的坐骑会被构建
  跳过，要刷新必须 `patch build --force`（详见 `/build-mount-patch`）。
