---
name: enrich-npc-data
description: 根据用户指定的 NPC YAML 文件，结合模型文件夹名与多模态图片识别、Playwright Wowhead 查询，补全缺失的官方数据字段。
---

# enrich-npc-data

根据用户指定的 NPC YAML 文件，结合模型文件夹名与多模态图片识别、Playwright Wowhead 查询，补全缺失的官方数据字段。

## 适用文件

- `data/resources/npcs/*.yaml`
- `sources/npcs/{model_folder}/*.png|*.gif`（用于多模态图片识别）

## 可补全字段

- `official_db.name`（中文官方名称）
- `official_db.npc_wowhead_url`（Wowhead NPC 页链接）
- `db.creature_template.entry`（← npc_id，用于生成 SQL 补丁时复用官方生物条目）
- `db.creature_template.name`（中文官方名称）
- `npc_type`（受控词表，见下）
- `subtype`（自由文本，如 兽人/恶魔守卫/红龙）
- `rarity`（人工定星，与宠物三星/四星口径一致）

NPC 生物类型受控词表（与 `backend/app/schemas/resource.py` 的 `NPC_TYPES` 同步），
顺序对应 3.3.5 `creature_template.type` ID，后续 SQL 补丁可直接映射：

| npc_type | type ID |
|----------|---------|
| 野兽 | 1 |
| 龙类 | 2 |
| 恶魔 | 3 |
| 元素 | 4 |
| 巨人 | 5 |
| 亡灵 | 6 |
| 人形生物 | 7 |
| 小动物 | 8 |
| 机械 | 9 |
| 未指定 | 0 |

暂不补全（Wowhead NPC 页面不提供，项目暂无本地提取管线）：

- `official_db.spell_icon_name` / `official_db.icon_name`（NPC 页无物品图标）
- `dbc.creature_model_data` / `dbc.creature_display_info`（需本地客户端 dump）
- `dbc.*` / `db.item_template.*` / `drop.*`（保持原状）

## 工作流程

1. **解析用户意图**
   - 从自然语言中提取目标文件路径、资源 ID 或图片目录。
   - 支持的表达："补全 0004 和 0012"、"补全 `data/resources/npcs/0004-*.yaml`"、
     "根据图片识别并补全"。
   - 如果没有明确指定，询问用户。批量任务单批不超过 10 个文件。

2. **读取目标 YAML 文件**
   - 使用 `Read` 工具读取每个指定的 `.yaml`。
   - 提取关键字段：`id`、`model_folder`、`official_db.name`、`db.creature_template.*`、`tags`。

3. **构造查询词（优先级从高到低）**
   - **模型文件夹英文段**：NPC 文件夹名多为官方生物名强信号
     （如 `ALEXSTRASZA爱斯女王NPC` → `Alexstrasza`、`Guldan古尔丹NPC` → `Guldan`）。
     首选该英文段直接查询。
   - **多模态图片识别**：英文段查不到或语义不明（如 `agronn`）时，
     读取 `sources/npcs/{model_folder}/` 下的预览图（`.png`/`.gif`），
     识别物种与知名角色特征，得出候选中英文名。
   - 无 `sources/npcs/` 预览文件夹的资源（约 4 个）：仅按文件夹名查询，notes 注明无图核对。

4. **调用 Wowhead 查询 CLI**
   ```bash
   uv run python -m app.cli wowhead lookup-npc "{query}"
   ```
   - CLI 自动回退：WotLK 简体中文 → 零售版简体中文 → 零售版英文。
   - 中文站对未翻译名称以方括号包裹（如 `[Alexstrasza]`），CLI 已自动识别并继续回退。
   - 若英文查询命中，CLI 会用 `npc_id` 回查零售版中文页补全中文名。
   - 命令输出 JSON。

5. **解析与验证**
   - 返回 `error` 时不要硬凑：换查询词重试一次（英文名/中文名互换），
     仍失败则转 `no_official_data` 流程。
   - `confidence: medium`（名称命中但缺类型）时，必须用预览图交叉核对
     页面 NPC 是否与本地模型一致；不一致视为未命中。
   - 重名生物（Guard/步兵/守卫类）极易误命中，宁缺勿错。
   - `creature_type` 词表外值（如页面出现"人形怪"变体）人工归入最接近的词表值。

6. **填充缺失字段（仅填空字段，保留原有非空值）**
   - `official_db.name` ← `name_zh`
   - `official_db.npc_wowhead_url` ← `npc_wowhead_url`
   - `db.creature_template.entry` ← `npc_id`
   - `db.creature_template.name` ← `name_zh`
   - `npc_type` ← `creature_type`（人工核对；与图片明显不符时以图片为准并在 notes 说明）
   - `subtype` / `rarity`：人工判定（subtype 按种族/变体，rarity 按星级口径）
   - 对确认无官方数据的 NPC（自定义/社区魔改模型）：
     - 顶部层级添加或追加 `tags: [no_official_data]`（retail 独有形态可加 `retail_only`）。
     - 添加 `notes` 记录查询词与外观描述（自定义模型说明、查询词、外观特征）。
     - 不修改 `official_db.name`（保持为空）。
     - `npc_type` / `subtype` 仍按图片人工填写。

7. **写入文件并展示 diff**
   - 使用 `Edit` 工具精确更新 YAML 字段，**禁止脚本批量改 YAML**。
   - 展示每个文件的变更摘要：文件路径、更新字段、旧值 → 新值。

8. **校验**
   - 每个补全后的 NPC 运行：
     ```bash
     uv run python -m app.cli resource validate -t npc -i {id}
     ```
   - 每批（≤10 个）完成后跑一遍 `resource validate -t npc` 汇总。

9. **失败处理**
   - 图片识别模糊、Wowhead 查询失败、交叉验证不一致或用户拒绝继续时，
     停止修改并向用户说明原因，不得强行写入。

## 注意事项

- 每次调用只处理用户明确指定的文件；批量任务单次不超过 10 个（Playwright 较慢）。
- 查询词优先英文段，中文名仅在英文段无结果时使用（Wowhead 中文站 NPC 搜索对英文更稳）。
- 图片识别仅作辅助与交叉验证，最终以 Wowhead 官方数据为准；两者冲突时不写入。
- 标记 `no_official_data` 后，`resource validate` 会跳过该 NPC 的 `official_db.name` 校验。
- `official_db.spell_icon_name` / `icon_name` 对 NPC 保持 null，不硬凑。

## 示例

### 英文段直查命中

用户：补全 `data/resources/npcs/0005-ALEXSTRASZA爱斯女王NPC.yaml`
1. 读取文件，`official_db.name` 为空，`model_folder: ALEXSTRASZA爱斯女王NPC`
2. 英文段 `ALEXSTRASZA` → 归一化查询词 `Alexstrasza`
3. `uv run python -m app.cli wowhead lookup-npc "Alexstrasza"` →
   `name_zh: 阿莱克丝塔萨 / npc_id: 58207 / creature_type: 龙类 / confidence: high`
4. 写入 `official_db.name`、`official_db.npc_wowhead_url`、
   `db.creature_template.{entry,name}`、`npc_type: 龙类`、`subtype: 红龙`、`rarity: 五星`
5. 展示 diff 并校验

### 图片识别 + 未命中

用户：补全 `data/resources/npcs/0001-agronn兽人猪NPC.yaml`
1. 英文段 `agronn` 语义不明，读取 `sources/npcs/agronn兽人猪NPC/兽人猪NPC.gif`
2. 识别为"兽人面孔的野猪人风格魔改模型"
3. `lookup-npc "兽人猪"` 无可靠命中，换英文亦无
4. 判定为自定义魔改模型，添加 `tags: [no_official_data]` + notes（查询词、外观）
5. `npc_type: 人形生物`、`subtype: 野猪人`（按图片人工定）
6. 说明原因并展示 diff

## 依赖

- `playwright`（已包含在 `backend/pyproject.toml`）
- Chromium 浏览器（已安装）
