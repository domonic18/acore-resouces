---
name: enrich-pet-data
description: 根据用户指定的宠物 YAML 文件，结合多模态图片识别与 Playwright Wowhead 查询，补全缺失的官方数据字段。
argument-hint: <pet-id-or-yaml-path> [--with-image]
allowed-tools: [Read, Edit, Bash, Grep, Glob]
model: sonnet
---

# enrich-pet-data

补全宠物 YAML 的官方数据字段。

**执行前必读共享工作流**：[docs/workflows/03资源数据补全工作流.md](../../../docs/workflows/03资源数据补全工作流.md)——
通用原则（只补缺失、宁缺勿错、写入纪律）、共享 10 步流程、文本清洗规则、
图标字段解析、校验要求都在那里，本文件只列**宠物类型差异**。

## 适用文件

- `data/resources/pets/*.yaml`
- `sources/pets/{model_folder}/*.png`（多模态图片识别）

## 宠物差异

### 查询入口

```bash
uv run python -m app.cli wowhead lookup-pet "{查询词}"
```

- 查询词策略：**中文名优先**（来自 `official_db.name` 或图片识别）。
- 页面形态：与坐骑不同，Wowhead 宠物以 **`/item=` 页面**（宠物学习物品）
  为核心；查询成功后自动补全 `/spell=` 与 `/item=` 链接；英文命中后用
  `item_id` 回查零售版中文物品页。
- **不复用官方 entry**（自定义 ID 段）；官方 `item_id` 只填
  `dbc.item.id`、`db.item_template.entry`（仅当现为占位符）与
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
| `db.creature_template.name` / `db.item_template.name` | `name_zh`（仅当占位符为空） |
| `db.item_template.entry` | `item_id`（仅当占位符为空） |
| `dbc.spell.icon_id` / `dbc.item.display_id` / `db.item_template.displayid` | 共享文档「图标字段解析」节 |

### 特有规则

- **自定义/私服法术**（常见 80000+ ID）且查询完全无结果时，标
  `tags: [no_official_data]`，不强行填充。
- 写入 `item_description` / `flavor_text` 前必须执行共享文档的**文本清洗**
  （`售价:` 会打断 YAML）。
- 校验命令：`uv run python -m app.cli resource validate -t pet -i {id}`。

## 示例

```
用户：补全 data/resources/pets/0006-*.yaml
1. 读共享工作流 → 读 YAML，official_db.name 为空
2. 图片识别 "绿色狐狸幼崽" → lookup-pet 无结果，英文亦无
3. 判定自定义模型 → tags: [no_official_data] + notes（查询词、外观）
4. star_rating 等人工判定字段仍按图片口径填写；展示 diff
```
