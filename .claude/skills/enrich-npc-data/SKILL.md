---
name: enrich-npc-data
description: 根据用户指定的 NPC YAML 文件，结合模型文件夹名与多模态图片识别、Playwright Wowhead 查询，补全缺失的官方数据字段。
argument-hint: <npc-id-or-yaml-path> [--with-image]
allowed-tools: [Read, Edit, Bash, Grep, Glob]
model: sonnet
---

# enrich-npc-data

补全 NPC YAML 的官方数据字段。

**执行前必读共享工作流**：[.claude/skills/references/资源数据补全工作流.md](../references/资源数据补全工作流.md)——
通用原则（只补缺失、宁缺勿错、写入纪律）、共享 10 步流程、校验要求都在那里，
本文件只列 **NPC 类型差异**（NPC 不写 description，文本清洗节一般不触发）。

## 适用文件

- `data/resources/npcs/*.yaml`
- `sources/npcs/{model_folder}/*.png|*.gif`（多模态图片识别）

## NPC 差异

### 查询入口

```bash
uv run python -m app.cli wowhead lookup-npc "{查询词}"
```

- 查询词策略：**模型文件夹英文段优先**（NPC 文件夹名多为官方生物名强信号，
  如 `ALEXSTRASZA爱斯女王NPC` → `Alexstrasza`）；英文段查不到或语义不明时
  才用图片识别的中文名。中文站对未翻译名称以方括号包裹（`[Alexstrasza]`），
  CLI 已自动识别并继续回退。
- 页面形态：`/npc=` 为核心；英文命中后用 `npc_id` 回查零售版中文页补中文名。
- **复用官方 entry**：`db.creature_template.entry` ← `npc_id`（生成 SQL 补丁时
  直接复用官方生物条目，与坐骑/宠物的自定义 ID 段不同）。
- 无 `sources/npcs/` 预览图的资源（约 4 个）：仅按文件夹名查询，notes 注明无图核对。

### 字段映射

| YAML 字段 | ← Wowhead |
|-----------|-----------|
| `official_db.name` | `name_zh` |
| `official_db.npc_wowhead_url` | `npc_wowhead_url` |
| `db.creature_template.entry` | `npc_id` |
| `db.creature_template.name` | `name_zh` |
| `npc_type` | `creature_type`（人工核对后归入受控词表） |
| `subtype` / `rarity` | 人工判定（subtype 按种族/变体；rarity 按星级口径） |

### 特有规则

- **受控词表**：`npc_type` 取值与 `backend/app/schemas/resource.py` 的
  `NPC_TYPES` 同步，顺序对应 3.3.5 `creature_template.type` ID：
  野兽1 / 龙类2 / 恶魔3 / 元素4 / 巨人5 / 亡灵6 / 人形生物7 / 小动物8 /
  机械9 / 未指定0。词表外值（如「人形怪」变体）人工归入最接近的词表值。
- `confidence: medium`（名称命中但缺类型）时，必须用预览图交叉核对页面
  NPC 与本地模型是否一致；不一致视为未命中。
- **重名生物**（Guard/步兵/守卫类）极易误命中，宁缺勿错。
- 与图片明显不符时以图片为准定 `npc_type`，notes 说明。
- 保持为 null 不硬凑：`official_db.spell_icon_name` / `official_db.icon_name`
  （NPC 页无物品图标）；`dbc.creature_model_data` / `dbc.creature_display_info`
  （需本地客户端 dump，本流程不做）。
- `no_official_data` 时：`npc_type` / `subtype` 仍按图片人工填写，notes 记
  查询词与外观特征。
- 校验命令：`uv run python -m app.cli resource validate -t npc -i {id}`，
  每批完成后跑一遍 `resource validate -t npc` 汇总。

## 示例

```
用户：补全 data/resources/npcs/0005-ALEXSTRASZA爱斯女王NPC.yaml
1. 读共享工作流 → 读 YAML，official_db.name 为空
2. 英文段 ALEXSTRASZA → lookup-npc "Alexstrasza"
   → name_zh: 阿莱克丝塔萨 / npc_id: 58207 / creature_type: 龙类 / confidence: high
3. 写入 official_db.*、db.creature_template.{entry,name}、npc_type: 龙类、
   subtype: 红龙、rarity: 五星
4. 展示 diff → 校验
```
