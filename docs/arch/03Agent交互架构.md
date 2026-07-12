# Agent 交互架构

## 一、设计目标

1. **零配置即可读取**：Agent 打开项目后，通过固定路径的 JSON/YAML 文件即可了解全部资源。
2. **明确的 Schema 约束**：每个资源文件都有对应的 JSON Schema，Agent 可据此生成代码。
3. **可调用工具**：Agent 可调用项目内的 CLI/Python 脚本完成 CRUD 和导出。
4. **变更可追溯**：所有资源定义文件纳入 Git，Agent 修改后通过 Git diff 可审查。
5. **安全可控**：Agent 不直接修改 DBC/DB，只生成补丁脚本，人工确认后执行。

---

## 二、Agent 数据访问层

### 2.1 资源文件路径约定

```
acore-resouces/
├── data/
│   ├── resources/              # 单资源 YAML 文件
│   │   ├── mounts/
│   │   ├── pets/
│   │   └── npcs/
│   ├── schemas/                # JSON Schema 文件
│   └── registry.json           # 资源索引
```

### 2.2 资源索引（registry.json）

`registry.json` 是 Agent 快速了解项目资源全貌的入口：

```json
{
  "version": "1.0",
  "generated_at": "2026-07-12T12:00:00Z",
  "counts": {
    "mounts": 464,
    "pets": 56,
    "npcs": 32
  },
  "mounts": [
    {
      "id": 1,
      "name": "梦光符文牡鹿",
      "model_folder": "ardenwealdstagmount影叶符文牡鹿",
      "file": "mounts/0001-ardenwealdstagmount.yaml",
      "debug_passed": true,
      "added": true
    }
  ],
  "pets": [],
  "npcs": []
}
```

### 2.3 单资源文件格式

每个资源一个 YAML 文件，便于 Agent 直接读取和修改：

```yaml
# data/resources/mounts/0001-ardenwealdstagmount.yaml
id: 1
model_folder: "ardenwealdstagmount影叶符文牡鹿"
preview_image: "mounts/ardenwealdstagmount影叶符文牡鹿/清醒的梦魇.png"
mount_type: "陆地坐骑"
star_rating: "三星"
subtype: "鹿"
debug_passed: true
added: true
official_db:
  name: "梦光符文牡鹿"
  spell_icon_name: "inv_ardenwealdstagmount_blue"
  icon_name: "inv_ardenwealdstagmount_blue"
dbc:
  creature_model_data:
    id: 4000
    model_name: "creature\\ardenwealdstag\\ardenwealdstagmount.m2"
  creature_display_info:
    id: 140000
    model_id: 4000
  spell:
    id: 80000
    effect_misc_value_3: 140000
  item:
    id: 91000
db:
  creature_template:
    entry: 9140000
    name: "梦光符文牡鹿"
  item_template:
    entry: 91000
    name: "梦光符文牡鹿"
```

---

## 三、Agent 工具接口

### 3.1 接口分层

```
Agent
  │
  ├──► CLI 工具层（resource_cli.py / xlsx_sync.py / export_*）
  │      │
  │      ▼
  ├──► Python API 层（src/modules/*）
  │      │
  │      ▼
  └──► 数据层（YAML 文件 + SQLite）
```

### 3.2 CLI 工具清单

| 脚本 | 用途 | 示例 |
|------|------|------|
| `scripts/resource_cli.py` | 资源 CRUD、筛选、校验 | `python scripts/resource_cli.py list --type mount` |
| `scripts/xlsx_sync.py` | xlsx 与 YAML 双向同步 | `python scripts/xlsx_sync.py import --input 坐骑列表.xlsx` |
| `scripts/export_dbc_patch.py` | 导出 DBC 修改脚本 | `python scripts/export_dbc_patch.py --type mount --id 1` |
| `scripts/export_sql_patch.py` | 导出 SQL 补丁 | `python scripts/export_sql_patch.py --type mount --id 1` |
| `scripts/validate_all.py` | 全量校验 | `python scripts/validate_all.py` |

### 3.3 资源 CRUD 接口

```bash
# 列出资源
python scripts/resource_cli.py list --type mount
python scripts/resource_cli.py list --type mount --added --debug-passed
python scripts/resource_cli.py list --type mount --search "符文"

# 查看单个资源
python scripts/resource_cli.py get --type mount --id 1

# 新增资源
python scripts/resource_cli.py create --type mount --data '{"model_folder":"...", ...}'

# 更新资源字段
python scripts/resource_cli.py update --type mount --id 1 \
  --field official_db.name="新名称"

# 删除资源（软删除）
python scripts/resource_cli.py delete --type mount --id 1

# 校验资源
python scripts/resource_cli.py validate --type mount --id 1
```

### 3.4 xlsx 同步接口

```bash
# 从 xlsx 导入到 YAML
python scripts/xlsx_sync.py import \
  --input 坐骑列表.xlsx \
  --type mount \
  --output data/resources/mounts

# 从 YAML 导出到 xlsx
python scripts/xlsx_sync.py export \
  --type mount \
  --output 坐骑列表.xlsx
```

### 3.5 DBC/SQL 导出接口

```bash
# 导出单个资源的 DBC 修改脚本
python scripts/export_dbc_patch.py --type mount --id 1 \
  --output patches/mount_1_dbc.py

# 导出单个资源的 SQL 补丁
python scripts/export_sql_patch.py --type mount --id 1 \
  --output patches/mount_1_db.sql

# 导出自某标签以来的所有变更
python scripts/export_dbc_patch.py --type mount --since-tag v1.0.0 \
  --output patches/update_mount_dbc.py
python scripts/export_sql_patch.py --type mount --since-tag v1.0.0 \
  --output patches/update_mount_db.sql

# 一键导出所有变更
python scripts/export_all.py --since-tag v1.0.0 --output-dir patches/
```

---

## 四、Agent 工作流

### 4.1 读取资源工作流

```
Agent 需要了解某坐骑信息
   ↓
读取 data/registry.json 定位资源文件
   ↓
读取 data/resources/mounts/0001-xxx.yaml
   ↓
解析 YAML 获取 DBC/DB 字段
   ↓
如需图片，访问 mounts/xxx/xxx.png
```

### 4.2 修改资源工作流

```
Agent 收到修改指令
   ↓
读取资源 YAML 文件
   ↓
修改字段值
   ↓
调用 resource_cli.py validate 校验
   ↓
写入 YAML 文件
   ↓
（可选）调用 xlsx_sync.py export 同步 Excel
   ↓
Git diff 展示变更
```

### 4.3 生成 DBC/SQL 补丁工作流

```
Agent 收到“把坐骑 X 加入游戏”指令
   ↓
读取资源 YAML
   ↓
校验 ID 关联一致性
   ↓
调用 export_dbc_patch.py 生成 Python 脚本
   ↓
调用 export_sql_patch.py 生成 SQL 文件
   ↓
展示补丁 diff，等待人工确认
   ↓
人工确认后执行：
   python patches/mount_x_dbc.py
   /Users/deadwalk/Workspace/acore-deploy/scripts/acore-update-dbc.sh
   /Users/deadwalk/Workspace/acore-deploy/scripts/acore-update-db.sh \
     --sql-file patches/mount_x_db.sql --database acore_world
```

---

## 五、Agent 安全约束

### 5.1 禁止直接操作

Agent **不得**直接执行以下操作：

- 直接修改 `.xlsx` 文件结构（必须通过 `xlsx_sync.py`）。
- 直接覆盖 `wow-dbc/src/dbc/*.dbc`（必须通过生成的脚本，人工确认）。
- 直接连接 `acore-world` 数据库执行写入（必须通过 `acore-update-db.sh`）。
- 直接删除原始图片资源目录。

### 5.2 推荐操作流程

| 操作 | 推荐方式 |
|------|---------|
| 读取资源 | 直接读取 YAML |
| 修改资源 | CLI 或直接写 YAML + validate |
| 导出 DBC | `export_dbc_patch.py` |
| 导出 SQL | `export_sql_patch.py` |
| 应用 DBC | 人工执行生成的脚本 + `acore-update-dbc.sh` |
| 应用 SQL | 人工执行 `acore-update-db.sh --dry-run` 后再执行 |

### 5.3 大文件处理

- `.xlsx` 文件共约 730MB+，Agent 不应在内存中全量加载。
- 图片目录数 GB，Agent 不应遍历所有图片。
- 优先使用 `registry.json` 和单资源 YAML 文件。

---

## 六、与人类协作模式

### 6.1 分工

| 角色 | 职责 |
|------|------|
| 人类 | 在 Excel/Web UI 中维护资源；审查 Agent 生成的补丁；执行高风险操作 |
| Agent | 读取 YAML、校验数据、生成 DBC/SQL 补丁、回答资源相关问题 |

### 6.2 协作流程

```
人类：在 Excel/Web UI 中新增/修改资源
   ↓
xlsx_sync.py import（如从 Excel 导入）
   ↓
YAML 资源文件更新
   ↓
Agent：校验、生成补丁、回答询问
   ↓
人类：审查 patches/ 目录下的 diff
   ↓
人类：执行 acore-update-dbc.sh / acore-update-db.sh
   ↓
测试服验证
   ↓
人类：确认无误后提交 Git
```

---

## 七、Agent 可复用的现有能力

### 7.1 `wow-dbc-tool` Python API

```python
import sys
sys.path.insert(0, '/Users/deadwalk/Workspace/acore-deploy/wow-dbc/tools/wow-dbc-tool/src')
from wow_dbc_tool.core.dbc_file import DBCFile

spell = DBCFile('/Users/deadwalk/Workspace/acore-deploy/wow-dbc/src/dbc/Spell.dbc')
spell.load()

# 查询记录
record = spell.get(ID=80000)

# 修改记录
spell.edit(record,
    EffectAuraPeriod_1=32,
    EffectMechanic_1=99,
    AttributesExD=0
)

spell.save('/Users/deadwalk/Workspace/acore-deploy/wow-dbc/src/dbc/Spell.dbc')
```

### 7.2 `mount-config` skill

位置：`/Users/deadwalk/Workspace/acore-deploy/wow-dbc/tools/wow-dbc-tool/.claude/skills/mount-config/`

Agent 在配置坐骑时应参考其中的字段映射和推荐值。

### 7.3 `acore-update-dbc.sh`

位置：`/Users/deadwalk/Workspace/acore-deploy/scripts/acore-update-dbc.sh`

用于将 `wow-dbc/src/dbc/` 同步到 `acore-deploy/data/dbc/`。

### 7.4 `acore-update-db.sh`

位置：`/Users/deadwalk/Workspace/acore-deploy/scripts/acore-update-db.sh`

用于将 SQL 补丁导入 `acore-world`。

---

## 八、未来扩展

### 8.1 HTTP API

在 CLI 基础上封装 FastAPI，提供 RESTful 接口：

```
GET    /api/mounts              # 列出坐骑
GET    /api/mounts/{id}         # 获取坐骑详情
POST   /api/mounts              # 新增坐骑
PUT    /api/mounts/{id}         # 更新坐骑
DELETE /api/mounts/{id}         # 删除坐骑
POST   /api/mounts/{id}/export  # 导出 DBC/SQL 补丁
```

### 8.2 MCP Server

将资源管理工具封装为 MCP Server，Claude Code 可通过 MCP 协议直接调用：

- `list_resources`
- `get_resource`
- `update_resource`
- `export_dbc_patch`
- `export_sql_patch`

### 8.3 自然语言查询

Agent 可直接回答：

- “列出所有未添加的飞行坐骑”
- “坐骑 ID 为 1 的 Spell ID 是多少？”
- “生成把梦光符文牡鹿加入游戏的 DBC 和 SQL 补丁”

---

## 九、附录：Agent 常用代码片段

### 9.1 读取所有坐骑名称和 Spell ID

```python
import yaml
from pathlib import Path

for f in Path('data/resources/mounts').glob('*.yaml'):
    data = yaml.safe_load(f.read_text())
    name = data['official_db']['name']
    spell_id = data['dbc']['spell']['id']
    print(f'{name}: spell={spell_id}')
```

### 9.2 批量更新坐骑速度

```python
import yaml
from pathlib import Path

for f in Path('data/resources/mounts').glob('*.yaml'):
    data = yaml.safe_load(f.read_text())
    if data['mount_type'] == '陆地坐骑':
        data['dbc']['spell']['aura_period_1'] = 32
        data['dbc']['spell']['effect_mechanic_1'] = 99
        f.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
```

### 9.3 校验资源关联

```python
import yaml, json
from pathlib import Path
from jsonschema import validate

schema = json.loads(Path('data/schemas/mount.schema.json').read_text())
data = yaml.safe_load(Path('data/resources/mounts/0001-ardenwealdstagmount.yaml').read_text())
validate(instance=data, schema=schema)
print("校验通过")
```
