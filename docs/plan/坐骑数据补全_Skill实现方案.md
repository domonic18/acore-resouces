# 坐骑数据补全 Skill 实现方案

## 设计思路

用户希望采用更轻量的方式实现坐骑数据补全：

- **不引入重型 CLI 工具或复杂架构**
- **通过自然语言指定要补全的文件或目录**
- **Skill 支持多模态图片识别：读取 `sources/mounts/{model_folder}/` 下的预览图，识别坐骑名称**
- **Skill 内部使用 Playwright 访问 Wowhead 查询官方数据**
- **直接修改指定的 YAML 文件并展示 diff**
- **为未来扩展宠物（pets）信息获取预留结构**

因此，本方案设计为一个 **Claude Code Skill（Slash Command）**，配合后端标准 CLI 模块与 Playwright 服务，按需处理用户指定的坐骑 YAML 文件。

---

## 整体架构（轻量版）

```
.claude/commands/fix-mount-data.md      # Skill / Slash Command 定义
backend/app/services/wowhead.py         # Playwright 查询服务
backend/app/cli/wowhead.py              # Typer CLI 入口
backend/app/cli/main.py                 # CLI 注册
data/resources/mounts/*.yaml            # 待补全的坐骑数据文件
sources/mounts/{model_folder}/*.png     # 坐骑预览图，用于多模态识别
```

无需新增：

- 复杂模块分层
- proposal/apply 工作流
- SQLite 同步逻辑
- 批量调度系统

---

## Skill 设计

### 触发方式

1. **Slash Command**：`/fix-mount-data`
2. **自然语言**：
   - "补全 `data/resources/mounts/0003-*.yaml` 的官方数据"
   - "用 Wowhead 更新这几个坐骑文件的 name 和 description"
   - "修正 0003、0005、0010 号坐骑的 spell icon 和 item display_id"
   - "根据 `sources/mounts/ardenwealdstagmount/` 的图片识别并补全 0003 号坐骑"
   - "看一下这个坐骑的图片，帮我补全它的 YAML 数据"

### Skill 行为

Skill Prompt 指示 Claude 按以下流程执行：

1. **解析用户意图**
   - 从自然语言中提取目标文件路径、资源 ID 或图片目录。
   - 如果没有明确指定，询问用户。

2. **读取目标 YAML 文件**
   - 使用 `Read` 工具读取每个指定的 `.yaml`。
   - 提取关键字段：`official_db.name`、`model_folder`、现有 `dbc.spell.*`、`dbc.item.*`。

3. **多模态图片识别（可选但推荐）**
   - 如果 YAML 中 `official_db.name` 为空、不可靠，或用户主动要求“根据图片识别”，则读取 `sources/mounts/{model_folder}/` 下的预览图。
   - 使用 Claude 的多模态能力识别图片中的坐骑，输出最可能的中文名称和英文原名。
   - 识别结果作为 Wowhead 查询词，并在后续步骤中与 Wowhead 返回的“英语：XXX”交叉验证。

4. **调用 Wowhead 查询 CLI**
   - 以中文名称（来自 YAML 或图片识别）为查询词，调用：
     ```bash
     uv run python -m app.cli wowhead lookup-mount "{query}"
     ```
   - 命令返回 JSON：中文名称、英文原名、描述、图标名称、spell_id、item_id 等。

5. **填充缺失字段**
   - 对比 YAML 中已有值与 Wowhead 返回值。
   - 仅更新为空或不一致的字段。

6. **写入文件并展示 diff**
   - 使用 `Edit` 或 `Write` 更新 YAML。
   - 展示变更内容，供用户确认。

7. **失败处理**
   - 如果图片识别模糊、Wowhead 查询失败或识别结果不一致，向用户报告并停止修改。

---

## Playwright 查询服务与 CLI

### 文件

- `backend/app/services/wowhead.py`：Playwright 查询服务，包含 `search_mount(query)` 和 `search_mount_json(query)`。
- `backend/app/cli/wowhead.py`：Typer CLI 入口，提供 `lookup-mount` 子命令。
- `backend/app/cli/main.py`：注册 `wowhead` 子命令。

### 职责

接收一个坐骑中文名称，返回从 Wowhead WotLK 简体中文页面提取的关键字段。

### 输入

```bash
uv run python -m app.cli wowhead lookup-mount "无敌"
```

### 输出

```json
{
  "query": "无敌",
  "url": "https://www.wowhead.com/wotlk/cn/spell=72286/无敌?locale=zh",
  "name_zh": "无敌",
  "name_en": "Invincible",
  "description": "召唤或解散一匹可飞翔的骸骨战马－－无敌。这种坐骑的速度会根据你的骑术等级和所在区域改变。",
  "icon_name": "spell_deathknight_summondeathcharger",
  "spell_id": 72286,
  "item_id": 50818,
  "mount_id": 363,
  "source": "巫妖王，冰冠堡垒（25H）",
  "confidence": "high",
  "error": null
}
```

### 实现要点

```python
# backend/app/services/wowhead.py
from playwright.sync_api import sync_playwright


def search_mount(query: str) -> dict:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1280, "height": 800},
            user_agent="..."
        )

        # 1. 中文搜索
        search_url = f"https://www.wowhead.com/wotlk/search?q={quote(query)}&locale=zh"
        page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)

        # 2. 从结果中找到"坐骑"类型的第一个法术链接
        mount_link = page.locator("a[href*='/wotlk/cn/spell=']").filter(has_text=query).first
        if not mount_link.count():
            return {"error": "未找到坐骑结果"}

        href = mount_link.get_attribute("href")

        # 3. 访问法术详情页
        page.goto(href + "?locale=zh", wait_until="domcontentloaded", timeout=30000)
        time.sleep(3)

        # 4. 解析页面文本
        body_text = page.inner_text("body")
        name_zh = page.locator("h1").first.inner_text()
        name_en = extract_english_name(body_text)  # "英语：Invincible"
        description = extract_description(body_text)
        icon_name = extract_icon_name(body_text)
        mount_id = extract_mount_id(body_text)

        # 5. 在搜索结果页查找关联的物品（缰绳）链接
        item_link = page.locator("a[href*='/wotlk/cn/item=']").filter(has_text="缰绳").first
        item_id = None
        if item_link.count():
            item_href = item_link.get_attribute("href")
            item_id = extract_id_from_href(item_href)

        browser.close()

        return {
            "query": query,
            "url": page.url,
            "name_zh": name_zh,
            "name_en": name_en,
            "description": description,
            "icon_name": icon_name,
            "spell_id": extract_id_from_href(href),
            "item_id": item_id,
            "mount_id": mount_id,
        }
```

### 数据提取策略

- **中文名称**：`h1` 标题
- **英文原名**：页面文本中 `英语：XXX` 片段
- **描述**：Quick Facts 区域中 "使用：" 或法术描述文本
- **图标名称**："图标：xxx" 片段
- **spell_id / item_id**：从 URL `spell={id}` / `item={id}` 提取
- **mount_id**："坐骑 ID：{id}" 片段

---

## 多模态图片识别

### 触发条件

1. YAML 中 `official_db.name` 为空或用户怀疑其不准确。
2. 用户明确要求“根据图片识别这个坐骑”。
3. 存在 `sources/mounts/{model_folder}/` 目录且包含 `.png` 预览图。

### 工作流程

1. 从 YAML 读取 `model_folder`（或从路径推断）。
2. 使用 `glob` 列出 `sources/mounts/{model_folder}/` 下的图片。
3. 选择最具代表性的图片（默认取第一张，或让用户指定）。
4. 通过 Claude 多模态能力识别图片内容，输出候选中文名称和英文原名。
5. 将候选名称交给 Playwright 脚本查询 Wowhead，交叉验证：
   - Wowhead 返回的英文原名应与图片识别结果一致或高度相关。
   - 不一致时向用户报告，由用户决定使用哪个名称。

### 识别结果格式

```json
{
  "identified_name_zh": "无敌",
  "identified_name_en": "Invincible",
  "confidence": "high",
  "reasoning": "图片中为一匹可飞翔的骸骨战马，与无敌形象一致。"
}
```

### 与宠物扩展的兼容性

- 图片目录结构遵循 `sources/{type}/{model_folder}/`。
- 坐骑对应 `type=mounts`，未来宠物对应 `type=pets`。
- Skill 可通过资源类型参数复用同一识别逻辑，仅 Wowhead 查询路径和可补全字段不同。

---

## Skill Prompt 草案

```markdown
# /fix-mount-data

根据用户指定的坐骑 YAML 文件，使用 Playwright 查询 Wowhead 官方数据库，补全缺失的字段。

## 适用文件

- `data/resources/mounts/*.yaml`
- `sources/mounts/{model_folder}/*.png`（用于多模态图片识别）

未来可扩展：

- `data/resources/pets/*.yaml`
- `sources/pets/{model_folder}/*.png`

## 可补全字段

- `official_db.name`（中文官方名称）
- `dbc.spell.name` / `dbc.spell.description` / `dbc.spell.icon_id`
- `dbc.item.display_id`
- `official_db.icon_name` / `official_db.spell_icon_name`

## 工作流程

1. 从用户输入中提取目标文件路径、ID 或图片目录。
   - 例："补全 0003 和 0005" → `data/resources/mounts/0003-*.yaml`, `data/resources/mounts/0005-*.yaml`
   - 例："补全 `data/resources/mounts/0003-ardenwealdstagmount*.yaml`" → 直接使用该路径
   - 例："根据图片识别并补全 data/resources/mounts/0003-*.yaml" → 同时读取 `sources/mounts/{model_folder}/`

2. 读取每个 YAML 文件，提取 `official_db.name` 或 `model_folder`。

3. **图片识别（可选）**
   - 如果 `official_db.name` 为空或用户要求图片识别，读取 `sources/mounts/{model_folder}/` 下的预览图。
   - 使用多模态模型识别坐骑名称，输出候选中英文名称。
   - 将识别结果作为查询词，并在后续与 Wowhead 返回的 "英语：XXX" 交叉验证。

4. 调用辅助脚本：
   ```bash
   uv run python backend/scripts/wowhead_mount_lookup.py "{query}"
   ```

5. 解析返回的 JSON。
   - 如果返回 `error`，停止并向用户报告。
   - 如果 `confidence` 较低，询问用户是否继续。

6. 使用 `Edit` 工具更新 YAML 中的缺失字段。
   - 仅更新当前为空或与 Wowhead 不一致的字段。
   - 保留原有非空字段。

7. 展示变更摘要，包括：
   - 修改了哪些文件
   - 每个文件更新了哪些字段
   - 新旧值对比
   - 图片识别结果（如果启用）

## 注意事项

- 每次调用只处理用户明确指定的文件，不批量处理全部坐骑。
- 图片识别仅作为辅助，最终结果以 Wowhead 官方数据为准。
- 如果图片识别结果与 Wowhead 返回的英文原名不一致，必须向用户报告并请求确认。
- 如果 Wowhead 查询结果与预期不符，不要强行写入。
- 图标 ID（icon_id）需通过 `icon_name → icon_id` 映射表转换，如无法转换则保留 `icon_name`。
- `display_id` 如果无法从 Wowhead 页面直接提取，暂时跳过该字段。
- 未来扩展宠物时，图片目录改为 `sources/pets/{model_folder}/`，其余流程不变。

## 示例

用户：补全 `data/resources/mounts/0003-*.yaml` 的 spell name 和 description
Claude：
1. 读取文件
2. 提取 `official_db.name: 梦光符文牡鹿`
3. 调用脚本查询
4. 更新 `dbc.spell.name` 和 `dbc.spell.description`
5. 展示 diff

用户：根据图片识别并补全 data/resources/mounts/0003-*.yaml
Claude：
1. 读取 YAML，发现 `official_db.name` 为空，`model_folder: ardenwealdstagmount`
2. 读取 `sources/mounts/ardenwealdstagmount/` 下的预览图
3. 多模态识别："这是一只符文牡鹿，可能为梦光符文牡鹿"
4. 调用脚本查询 "梦光符文牡鹿"
5. Wowhead 返回英文原名 "Ardenweald Stag"，与识别结果交叉验证
6. 更新 `official_db.name`、`dbc.spell.name`、`dbc.spell.description`
7. 展示 diff
```

---

## 文件变更计划

### 新增文件

1. `backend/app/services/wowhead.py`
   - Playwright 查询服务，封装 Wowhead 页面解析逻辑

2. `backend/app/cli/wowhead.py`
   - Typer CLI 入口，提供 `lookup-mount` 命令

3. `.claude/commands/fix-mount-data.md`
   - Skill / Slash Command 定义
   - 包含图片识别触发条件、查询路径和交叉验证规则

4. `backend/scripts/wowhead_mount_lookup.py`（已删除）
   - 原临时脚本，按项目规范迁移到 `backend/app/services/` 与 `backend/app/cli/`

5. `backend/scripts/icon_name_to_id.py`（可选，未创建）
   - `icon_name → icon_id` 映射表维护脚本

### 修改文件

1. `backend/app/cli/main.py`
   - 注册 `wowhead` 子命令

2. `backend/pyproject.toml`
   - 已添加 `playwright` 依赖（保留）

### 删除文件

- `docs/plan/坐骑数据自动补全实现方案.md`（已完成删除）

---

## 依赖

已安装：

```bash
uv add playwright
uv run playwright install chromium
```

无需新增其他依赖。

---

## 使用示例

### 示例 1：补全单个文件

```
用户：请补全 data/resources/mounts/0003-ardenwealdstagmount影叶符文牡鹿.yaml 的 official_db.name 和 spell description

Claude：
1. 读取该 YAML
2. 发现 official_db.name = "梦光符文牡鹿"
3. 调用 `uv run python -m app.cli wowhead lookup-mount "梦光符文牡鹿"`
4. 返回结果后，对比并更新字段
5. 展示 diff
```

### 示例 2：补全多个文件

```
用户：用 Wowhead 更新 0003、0005、0010 号坐骑的图标和名称

Claude：
1. 解析 ID 为 0003、0005、0010
2. glob 匹配对应 YAML 文件
3. 依次查询并更新
4. 汇总展示三个文件的变更
```

### 示例 3：查询失败

```
Claude：Wowhead 未找到 "xxx" 的坐骑结果，请确认名称是否正确，或提供英文名称。
```

### 示例 4：根据图片识别补全

```
用户：根据图片识别并补全 data/resources/mounts/0003-ardenwealdstagmount影叶符文牡鹿.yaml

Claude：
1. 读取 YAML，发现 official_db.name 为空
2. 读取 sources/mounts/ardenwealdstagmount/ 下的预览图
3. 图片识别："这是一只符文牡鹿"
4. 调用 `uv run python -m app.cli wowhead lookup-mount "符文牡鹿"`
5. Wowhead 返回 spell_id、description、icon_name
6. 更新 YAML 并展示 diff
```

---

## 优势

| 方面 | 说明 |
|------|------|
| 轻量 | 1 个 skill + 后端标准服务/CLI 模块，无复杂架构 |
| 按需 | 用户指定哪些文件就处理哪些 |
| 自然语言 | 支持 "补全这几个文件" 等口语化表达 |
| 多模态 | 支持通过图片识别坐骑，解决名称缺失或不可靠的问题 |
| 可控 | 每次变更都有 diff 展示，不会批量污染数据 |
| 可扩展 | 后续可加入宠物（pets）数据源和字段 |

---

## 限制

1. **单次处理数量不宜过多**：Playwright 启动较慢，建议一次不超过 10 个文件。
2. **需要用户确认**：复杂或模糊的结果需要人工判断。
3. **图片识别不是 100% 准确**：相似外观的坐骑可能识别错误，必须与 Wowhead 返回的英文原名交叉验证。
4. **`display_id` 获取困难**：如必须获取，需要额外研究 Wowhead model viewer。
5. **依赖 Wowhead 页面结构**：如果 Wowhead 改版，解析逻辑需要同步更新。

---

## 下一步

1. 创建 `backend/app/services/wowhead.py`。
2. 创建 `backend/app/cli/wowhead.py` 并在 `backend/app/cli/main.py` 注册。
3. 创建 `.claude/commands/fix-mount-data.md`（包含图片识别触发条件和交叉验证规则）。
4. 在 3~5 个样本文件上测试 skill 流程，包括：
   - 已知中文名称直接补全
   - `official_db.name` 为空时通过图片识别补全
   - 图片识别结果与 Wowhead 不一致时的处理
5. 根据测试结果微调解析正则和 skill prompt。
6. 评估宠物扩展：复用图片识别逻辑，增加 `sources/pets/{model_folder}/` 路径和 Wowhead 宠物查询路径。
