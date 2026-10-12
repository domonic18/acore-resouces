---
name: export-mount-jobs
description: >
  根据用户指定的条件从 acore-resouces 资源库中筛选坐骑，
  为指定数量坐骑创建补丁任务（仅写 job.json 元数据），
  并可选择直接构建/发布为 patch-zhCN-5.mpq。
  支持按星级、调试状态、已发布状态、坐骑类型等条件组合筛选。
argument-hint: [--star <星级>] [--debug <true|false>] [--added <true|false>] [--type <坐骑类型>] [--count N]
allowed-tools: [Read, Bash]
model: sonnet
---

# /export-mount-jobs

按条件筛选坐骑资源，为前 N 个满足条件的坐骑创建补丁任务。
条件可组合使用，未指定条件时不应执行导出，需向用户确认。

## 输入格式

参数使用 `--key value` 形式，可组合：

- `--star <星级>`：如 `三星`、`四星`、`五星`。
- `--debug <true|false>`：调试通过状态。`false` 表示待调试。
- `--added <true|false>`：是否已标记为 added。
- `--type <坐骑类型>`：如 `陆地坐骑`、`飞行坐骑`、`水上坐骑`。
- `--count N`：导出数量，默认 5。

示例：

```text
/export-mount-jobs --star 四星 --debug false --count 5
/export-mount-jobs --type 飞行坐骑 --added false --count 3
/export-mount-jobs --debug false --count 10
```

## 执行流程

### 1. 解析条件并查询匹配坐骑

在 `backend` 目录下运行 Python，读取所有坐骑资源并按条件过滤：

```bash
cd backend
uv run python -c "
from app.services.resource_store import list_resources

mounts = [m for m in list_resources('mount')]
# 根据用户提供的条件逐项过滤
# --star
# mounts = [m for m in mounts if m.star_rating == '四星']
# --debug
# mounts = [m for m in mounts if m.debug_passed is False]
# --added
# mounts = [m for m in mounts if m.added is True]
# --type
# mounts = [m for m in mounts if m.mount_type == '飞行坐骑']

print(f'匹配坐骑总数: {len(mounts)}')
for m in mounts[:5]:
    print(f'{m.id:04d} {m.star_rating} added={m.added} debug={m.debug_passed} {m.official_db.name if m.official_db else m.model_folder}')
"
```

如果匹配数量为 0，停止并告知用户。

### 2. 创建补丁任务

对筛选出的前 N 个坐骑逐个创建补丁任务（任务目录仅含 `job.json`，
资源定义以 `data/resources/mounts/*.yaml` 真相源为准，构建时现场读取）：

```bash
cd backend
uv run python -c "
from app.services.resource_store import list_resources
from app.services.patch_exporter import create_patch_job

# 此处应使用与步骤 1 相同的过滤逻辑
mounts = [...][:5]
for m in mounts:
    create_patch_job('mount', m.id)
    print(f'exported mount_{m.id:04d}')
"
```

创建前会完全重置对应 `mount_{id:04d}` 目录。

### 3. （可选）构建并发布

如果用户要求同步构建/发布，执行：

```bash
# 干跑校验
cd backend
uv run python -m app.cli patch build --all-requested --dry-run

# 正式构建
cd backend
uv run python -m app.cli patch build --all-requested

# 发布
cd backend
uv run python -m app.cli patch publish
```

构建时会自动跳过 `data/sql/azerothcore-updates/` 中已存在 `item_template` entry 的坐骑（详见 `/build-mount-patch` 的 SQL 去重说明）。

## 输出产物

- `workspace/patch-jobs/mount_{id:04d}/`：补丁任务目录（固定目录，仅含 job.json）。
- （可选）`workspace/mpq/{timestamp}/patch-mounts.mpq`：批次 MPQ。
- （可选）`workspace/dist/{timestamp}/patch-zhCN-5.mpq`：客户端补丁。
- （可选）`data/sql/azerothcore-updates/mounts/{id:04d}_{slug}/`：仅新增坐骑的 SQL。
- （可选）`workspace/reports/{timestamp}/validation-report.json`：校验报告。

## 注意事项

- 未指定任何筛选条件时，不得执行导出，需请用户补充条件。
- 导出会重置已有的 `mount_{id:04d}` 目录，旧产物会被删除。
- 构建/发布是可选步骤，按用户指令决定是否执行。
- 发布固定使用 `patch-zhCN-5.mpq`，分发目录中同名文件会被覆盖。
