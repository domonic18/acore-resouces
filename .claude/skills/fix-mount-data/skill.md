---
name: fix-mount-data
description: 根据用户指定的坐骑 YAML 文件，结合多模态图片识别与 Playwright Wowhead 查询，补全缺失的官方数据字段。
---

# fix-mount-data

根据用户指定的坐骑 YAML 文件，结合多模态图片识别与 Playwright Wowhead 查询，补全缺失的官方数据字段。

## 适用文件

- `data/resources/mounts/*.yaml`
- `sources/mounts/{model_folder}/*.png`（用于多模态图片识别）

未来可扩展：

- `data/resources/pets/*.yaml`
- `sources/pets/{model_folder}/*.png`

## 可补全字段

- `official_db.name`（中文官方名称）
- `official_db.spell_icon_name`
- `official_db.icon_name`
- `official_db.spell_wowhead_url`
- `official_db.item_wowhead_url`
- `dbc.spell.name`
- `dbc.spell.description`
- `dbc.item.id`
- `dbc.item.description`
- `dbc.item.flavor_text`

暂不补全（项目缺少可靠映射或数据源）：

- `dbc.spell.icon_id`（需 `icon_name → icon_id` 映射表）
- `dbc.item.display_id`（Wowhead 页面不直接提供）

## 工作流程

1. **解析用户意图**
   - 从自然语言中提取目标文件路径、资源 ID 或图片目录。
   - 支持的表达：
     - "补全 0003 和 0005"
     - "补全 `data/resources/mounts/0003-*.yaml`"
     - "根据图片识别并补全 data/resources/mounts/0003-*.yaml"
     - "看一下这个坐骑的图片，帮我补全 YAML"
   - 如果没有明确指定，询问用户。

2. **读取目标 YAML 文件**
   - 使用 `Read` 工具读取每个指定的 `.yaml`。
   - 提取关键字段：`id`、`model_folder`、`official_db.name`、`dbc.spell.*`、`dbc.item.*`。

3. **多模态图片识别（可选）**
   - 触发条件：
     - `official_db.name` 为空、为占位符（如 `0`）或明显不可靠；
     - 用户明确要求“根据图片识别”。
   - 读取路径：`sources/mounts/{model_folder}/`。
   - 列出该目录下 `.png` 文件，选择最具代表性的一张（默认第一张）。
   - 使用 Claude 多模态能力识别图片，输出候选中文名称与英文原名，注意图片中的文字（如坐骑面板名称）。
   - 将识别结果作为后续 Wowhead 查询词。

4. **调用 Wowhead 查询 CLI**
   - 以中文名称（来自 YAML 或图片识别）为查询词，运行：
     ```bash
     uv run python -m app.cli wowhead lookup-mount "{query}"
     ```
   - CLI 会自动回退：WotLK 简体中文 → 零售版简体中文 → 零售版英文。
   - 若英文查询命中，会再用 spell_id 取回零售版中文页核对中文名称。
   - 命令输出 JSON。

5. **解析与验证**
   - 如果返回 `error` 或 `confidence` 为 `low`，不要直接写入，进入下一步回退流程。
   - 交叉验证：若启用图片识别，Wowhead 返回的 `name_en` 应与图片识别英文原名一致或高度相关；不一致时向用户报告并停止修改。

6. **失败回退**
   - 当首次查询失败或结果明显不对时，按以下顺序尝试：
     - 使用图片中识别到的中文/英文名称重新查询；
     - 使用 Wowhead 返回的 `name_en` 英文原名查询；
     - 通过 `WebSearch` 确认官方中文名、spell_id、item_id；
     - 仍无法命中时，跳过该文件并向用户说明原因（可能是自定义/NPC-only 坐骑）。

7. **清洗原始文本**
   - 对 `item_description` 和 `flavor_text` 进行清洗，删除以下 UI 噪声，避免 YAML 解析错误并保持字段干净：
     - `售价:` 及其后所有内容（冒号+空格会导致 YAML 解析失败）；
     - `[Vendor Locations]` 及商人位置、成本信息；
     - `\n\n屏幕截图`、`\n\n英文视频`、`贡献 添加评论` 等无关段落。
   - 同时去掉字符串开头的零宽空格（`U+200B`）。

8. **填充缺失字段**
   - 仅更新当前为空、为占位符（`0`/`null`）或与 Wowhead 不一致的字段。
   - 保留原有非空字段，但 `dbc.item.id` 应使用官方 `item_id` 填充，不保留自定义占位 `0`。
   - 更新映射：
     - `official_db.name` ← `name_zh`
     - `official_db.spell_icon_name` ← `icon_name`
     - `official_db.icon_name` ← `icon_name`
     - `official_db.spell_wowhead_url` ← `spell_wowhead_url`
     - `official_db.item_wowhead_url` ← `item_wowhead_url`
     - `dbc.spell.name` ← `name_zh`
     - `dbc.spell.description` ← `description`
     - `dbc.item.id` ← `item_id`
     - `dbc.item.description` ← 清洗后的 `item_description`
     - `dbc.item.flavor_text` ← 清洗后的 `flavor_text`
   - 若 `db.creature_template.name` / `db.item_template.name` 为占位符或与官方名称明显不一致，同步修正。

9. **写入文件并展示 diff**
   - 批量文件（>10）建议先用临时 Python 脚本配合 PyYAML 统一写入，再用 `Edit` 工具处理个别需要人工确认的字段。
   - 展示每个文件的变更摘要：文件路径、更新字段、旧值 → 新值。

10. **全量 YAML 校验**
    - 写入后运行：
      ```python
      import yaml, pathlib
      base = pathlib.Path('data/resources/mounts')
      for p in sorted(base.glob('*.yaml')):
          yaml.safe_load(p.read_text(encoding='utf-8'))
      ```
    - 发现解析错误时立即修复（通常是未清理的 `售价:` 或特殊字符）。

## 注意事项

- 每次调用只处理用户明确指定的文件，不批量处理全部坐骑。
- 批量较大时（超过 10 个），用一次 Bash 循环把所有查询结果输出到临时文件，再统一解析写入，避免 Playwright 反复启动。
- 图片识别仅作为辅助，最终结果以 Wowhead 官方数据为准。
- 如果 Wowhead 查询结果与预期不符（自定义坐骑、NPC-only），不要强行写入。
- 未来扩展宠物时，图片目录改为 `sources/pets/{model_folder}/`，其余流程不变。

## 示例

### 直接补全

用户：补全 `data/resources/mounts/0003-*.yaml` 的 spell name 和 description
Claude：
1. 读取文件
2. 提取 `official_db.name: 梦光符文牡鹿`
3. 调用 `uv run python -m app.cli wowhead lookup-mount "梦光符文牡鹿"`
4. 更新 `dbc.spell.name` 和 `dbc.spell.description`
5. 展示 diff

### 根据图片识别补全

用户：根据图片识别并补全 data/resources/mounts/0003-*.yaml
Claude：
1. 读取 YAML，发现 `official_db.name` 为空，`model_folder: ardenwealdstagmount影叶符文牡鹿`
2. 读取 `sources/mounts/ardenwealdstagmount影叶符文牡鹿/` 下的预览图
3. 多模态识别："这是一只符文牡鹿，可能为梦光符文牡鹿"
4. 调用 `uv run python -m app.cli wowhead lookup-mount "梦光符文牡鹿"`
5. Wowhead 返回英文原名 "Ardenweald Stag"，与识别结果交叉验证
6. 更新 `official_db.name`、`dbc.spell.name`、`dbc.spell.description`
7. 展示 diff

### 查询失败

用户：补全 `data/resources/mounts/0003-*.yaml`
Claude：Wowhead 未找到 "xxx" 的坐骑结果，请确认名称是否正确，或提供英文名称。

## 依赖

- `playwright`（已包含在 `backend/pyproject.toml`）
- Chromium 浏览器（已安装）
