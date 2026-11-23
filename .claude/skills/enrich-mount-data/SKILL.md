---
name: enrich-mount-data
description: 根据用户指定的坐骑 YAML 文件，结合多模态图片识别与 Playwright Wowhead 查询，补全缺失的官方数据字段。
argument-hint: <mount-id-or-yaml-path> [--with-image]
allowed-tools: [Read, Edit, Bash, Grep, Glob]
model: sonnet
---

# enrich-mount-data

补全坐骑 YAML 的官方数据字段。

**执行前必读共享工作流**：[.claude/skills/references/资源数据补全工作流.md](../references/资源数据补全工作流.md)——
通用原则（只补缺失、宁缺勿错、写入纪律）、共享 10 步流程、文本清洗规则、
图标字段解析、校验要求都在那里，本文件只列**坐骑类型差异**。

## 适用文件

- `data/resources/mounts/*.yaml`
- `sources/mounts/{model_folder}/*.png`（多模态图片识别）

## 坐骑差异

### 查询入口

```bash
uv run python -m app.cli wowhead lookup-mount "{查询词}"
```

- 查询词策略：**中文名优先**（来自 `official_db.name` 或图片识别）；
  英文名作回退。
- 页面形态：`/spell=` 为核心；英文命中后用 `spell_id` 回查零售版中文页。
- **不复用官方 entry**：坐骑走自定义 ID 段（spell 80xxx / item 9xxxx /
  creature 914xxxx），官方 item_id 只填 `dbc.item.id` 与
  `official_db.item_wowhead_url`。

### 字段映射

| YAML 字段 | ← Wowhead |
|-----------|-----------|
| `official_db.name` | `name_zh` |
| `official_db.spell_icon_name` / `official_db.icon_name` | `icon_name` |
| `official_db.spell_wowhead_url` / `official_db.item_wowhead_url` | 对应 URL |
| `dbc.spell.name` / `dbc.spell.description` | `name_zh` / `description` |
| `dbc.item.id` | `item_id` |
| `dbc.item.description` / `dbc.item.flavor_text` | 清洗后的对应文本 |
| `dbc.spell.icon_id` / `dbc.item.display_id` / `db.item_template.displayid` | 共享文档「图标字段解析」节 |

### 特有规则

- 图标字段（icon_id / display_id）**可补全**，按共享文档图标节反查；
  机械批量回填走 dry-run → 用户确认 → `--execute`。
- `db.creature_template.name` / `db.item_template.name` 为占位符或与官方
  名称明显不一致时同步修正。
- 同模型 + 不同贴图变体区分新坐骑是合法配置；数据补全时不改
  `dbc.creature_display_info.texture_variation_*`（属外观决策，不走本流程）。

## 示例

```
用户：补全 data/resources/mounts/0003-*.yaml 的 spell name 和 description
1. 读共享工作流 → 读 YAML，提取 official_db.name: 梦光符文牡鹿
2. lookup-mount "梦光符文牡鹿" → name_zh/description/confidence
3. Edit 写入 dbc.spell.name / dbc.spell.description（清洗规则不适用则跳过）
4. 展示 diff → 两项校验
```
