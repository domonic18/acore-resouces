# Agent 交互架构

## 一、设计目标

1. **零配置即可读取**：Agent 打开项目后，通过固定路径的 JSON/YAML 文件即可了解全部资源。
2. **明确的 Schema 约束**：每个资源文件都有对应的 JSON Schema，Agent 可据此生成代码。
3. **可调用工具**：Agent 可调用项目内的 CLI/Python 脚本完成 CRUD 和导出。
4. **变更可追溯**：所有资源定义文件纳入 Git，Agent 修改后通过 Git diff 可审查。
5. **安全可控**：Agent 不直接修改 DBC/DB，只生成补丁脚本，人工确认后执行。
6. **本地优先**：Agent 读取本地 YAML/JSON 文件，并通过本地 CLI 完成写入操作。

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
│   ├── mapping/                # xlsx 列映射配置
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
      "file": "data/resources/mounts/0001-ardenwealdstagmount.yaml",
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
preview_image: "sources/mounts/ardenwealdstagmount影叶符文牡鹿/清醒的梦魇.png"
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
  creature_model_info:
    display_id: 140000
  item_template:
    entry: 91000
    spellid_2: 80000
```

---

## 三、Agent 工具接口

### 3.1 接口分层

```
Agent
  │
  ├──► CLI 工具层（backend/app/cli/）
  │      │
  │      ▼
  ├──► Python API 层（backend/app/services/）
  │      │
  │      ▼
  └──► 数据层（YAML 文件 + SQLite）
```

### 3.2 CLI 工具清单

所有 CLI 使用 **Typer** 构建，统一入口为 `python -m backend.app.cli`。

| 命令 | 用途 | 示例 |
|------|------|------|
| `resource list` | 列出资源 | `python -m backend.app.cli resource list --type mount` |
| `resource get` | 获取单个资源 | `python -m backend.app.cli resource get --type mount --id 1` |
| `resource create` | 新增资源 | `python -m backend.app.cli resource create --type mount --data '{...}'` |
| `resource update` | 更新资源字段 | `python -m backend.app.cli resource update --type mount --id 1 --field ...` |
| `resource delete` | 软删除资源 | `python -m backend.app.cli resource delete --type mount --id 1` |
| `resource validate` | 校验资源 | `python -m backend.app.cli resource validate --type mount --id 1` |
| `xlsx export` | YAML 导出 xlsx（只读展示） | `python -m backend.app.cli xlsx export --type mount --output 坐骑列表.xlsx` |
| `validate` | 全量校验 | `python -m backend.app.cli validate` |
| `export dbc` | 导出 DBC 修改脚本 | `python -m backend.app.cli export dbc --type mount --id 1` |
| `export sql` | 导出 SQL 补丁 | `python -m backend.app.cli export sql --type mount --id 1` |
| `export all` | 一键导出所有变更 | `python -m backend.app.cli export all --since-tag v1.0.0` |

### 3.3 资源 CRUD 接口

```bash
# 列出资源
python -m backend.app.cli resource list --type mount
python -m backend.app.cli resource list --type mount --added --debug-passed
python -m backend.app.cli resource list --type mount --search "符文"

# 查看单个资源
python -m backend.app.cli resource get --type mount --id 1

# 新增资源
python -m backend.app.cli resource create --type mount \
  --data '{"model_folder":"aetherserpentmount咒缚恒龙", ...}'

# 更新资源字段
python -m backend.app.cli resource update --type mount --id 1 \
  --field official_db.name="咒缚恒龙" \
  --field debug_passed=true

# 删除资源（软删除）
python -m backend.app.cli resource delete --type mount --id 1

# 校验资源
python -m backend.app.cli resource validate --type mount --id 1
```

### 3.4 xlsx 导出接口

`.xlsx` 仅用于导出展示，不再作为同步来源。导入功能仅在系统初始化时使用 `scripts/xlsx_import.py` 一次性执行。

```bash
# 从 YAML 导出到 xlsx（只读展示）
python -m backend.app.cli xlsx export \
  --type mount \
  --output 坐骑列表.xlsx
```

### 3.5 DBC/SQL 导出接口

```bash
# 导出单个资源的 DBC 修改脚本
python -m backend.app.cli export dbc --type mount --id 1 \
  --output patches/mount_1_dbc.py

# 导出单个资源的 SQL 补丁
python -m backend.app.cli export sql --type mount --id 1 \
  --output patches/mount_1_db.sql

# 导出自某标签以来的所有变更
python -m backend.app.cli export dbc --type mount --since-tag v1.0.0 \
  --output patches/update_mount_dbc.py
python -m backend.app.cli export sql --type mount --since-tag v1.0.0 \
  --output patches/update_mount_db.sql

# 一键导出所有变更
python -m backend.app.cli export all --since-tag v1.0.0 --output-dir patches/
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
如需图片，访问 sources/mounts/xxx/xxx.png
   ↓
如需贴图/3D 预览，通过桌面应用界面调用预览服务
```

### 4.2 修改资源工作流

```
Agent 收到修改指令
   ↓
读取资源 YAML 文件或调用 CLI get
   ↓
修改字段值（直接写 YAML 或调用 CLI update）
   ↓
调用 CLI validate 校验
   ↓
写入 YAML 文件（CLI 会自动同步 SQLite）
   ↓
（可选）调用 CLI xlsx export 导出 Excel 供人工查看
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
调用 CLI export dbc 生成 Python 脚本
   ↓
调用 CLI export sql 生成 SQL 文件
   ↓
展示补丁 diff，等待人工确认
   ↓
人工确认后执行：
   python patches/mount_x_dbc.py
   /Users/deadwalk/Workspace/acore-deploy/scripts/acore-update-dbc.sh
   /Users/deadwalk/Workspace/acore-deploy/scripts/acore-update-db.sh \
     --sql-file patches/mount_x_db.sql --database acore_world
```

### 4.4 Agent 元数据驱动开发流程

```
Agent 接到开发任务（如“把咒缚恒龙加入游戏”）
   ↓
调用 CLI resource get / 读取 YAML 获取资源完整元数据
   ↓
根据元数据定位原始模型/贴图文件，必要时校验文件存在性
   ↓
基于 Schema 生成或补全 DBC/DB 字段
   ↓
调用 CLI resource update 更新资源元数据
   ↓
系统校验并记录变更
   ↓
调用 CLI export dbc / export sql 生成补丁
   ↓
人工审查 patches/ 目录 diff
   ↓
人工执行 acore-update-dbc.sh / acore-update-db.sh
   ↓
测试服验证
```

---

## 五、Agent 安全约束

### 5.1 禁止直接操作

Agent **不得**直接执行以下操作：

- 直接修改 `.xlsx` 文件结构（`.xlsx` 仅用于导出展示）。
- 直接覆盖 `wow-dbc/src/dbc/*.dbc`（必须通过生成的脚本，人工确认）。
- 直接连接 `acore-world` 数据库执行写入（必须通过 `acore-update-db.sh`）。
- 直接删除原始图片资源目录。
- 直接修改 `registry.json`（必须由系统同步生成）。

### 5.2 推荐操作流程

| 操作 | 推荐方式 |
|------|---------|
| 读取资源 | 直接读取 YAML 或调用 CLI `resource get` |
| 修改资源 | CLI `resource update` / 直接写 YAML + `validate` |
| 导出 xlsx | `python -m backend.app.cli xlsx export` |
| 导出 DBC | `python -m backend.app.cli export dbc` |
| 导出 SQL | `python -m backend.app.cli export sql` |
| 应用 DBC | 人工执行生成的脚本 + `acore-update-dbc.sh` |
| 应用 SQL | 人工执行 `acore-update-db.sh --dry-run` 后再执行 |

### 5.3 大文件处理

- `.xlsx` 文件共约 730MB+，仅用于一次性导入；导入后不再读取，导出时按需生成。
- 图片目录数 GB，Agent 不应遍历所有图片；优先使用 `registry.json` 和单资源 YAML 文件。
- `.m2` / `.blp` 文件按需通过桌面应用预览界面访问，避免直接读取大文件。

---

## 六、附录：Agent 常用代码片段

### 6.1 读取所有坐骑名称和 Spell ID

```python
import yaml
from pathlib import Path

for f in Path('data/resources/mounts').glob('*.yaml'):
    data = yaml.safe_load(f.read_text())
    name = data['official_db']['name']
    spell_id = data['dbc']['spell']['id']
    print(f'{name}: spell={spell_id}')
```

### 6.2 批量更新坐骑速度

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

### 6.3 校验资源关联

```python
import yaml, json
from pathlib import Path
from jsonschema import validate

schema = json.loads(Path('data/schemas/mount.schema.json').read_text())
data = yaml.safe_load(Path('data/resources/mounts/0001-ardenwealdstagmount.yaml').read_text())
validate(instance=data, schema=schema)
print("校验通过")
```

### 6.4 通过 CLI 获取资源详情

```bash
python -m backend.app.cli resource get --type mount --id 1
```

### 6.5 通过 CLI 校验并导出资源

```bash
# 校验单个资源
python -m backend.app.cli resource validate --type mount --id 1

# 导出 DBC/SQL 补丁
python -m backend.app.cli export dbc --type mount --id 1 --output patches/mount_1_dbc.py
python -m backend.app.cli export sql --type mount --id 1 --output patches/mount_1_db.sql
```
