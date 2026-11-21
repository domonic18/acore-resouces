---
name: configure-mount-spell
description: >
  Reference for WoW 3.3.5a custom mount Spell.dbc fields.
  Covers land, flying, water, and hybrid mounts with field-level guidance
  for Mechanic, Attributes, Aura effects, and server-side rules.
  Note: the production pipeline generates Spell.dbc records automatically
  from the resource YAML; this skill documents the field semantics.
argument-hint: <mount-type> [constraints...]
allowed-tools: [Read, Edit, Write, Bash]
model: sonnet
---

# 魔兽世界 3.3.5a 坐骑法术配置参考

## ⚠️ 首要原则：不要手改 Spell.dbc

本项目的补丁管线会**自动生成**坐骑法术记录：

```
data/resources/mounts/{id}.yaml 的 mount_type
    → patch_exporter.SPELL_TYPE_TEMPLATES
    → build_dbc_plan() 产出 Spell.dbc 的 add 记录
```

正确做法是**只写 YAML**（`mount_type` / `special_features` / `dbc.spell.speed`），
让管线生成 DBC 记录。手改 Spell.dbc 会被下次构建覆盖，且容易写错字段。

本 Skill 的用途是**理解字段语义**——排查构建产物、核对官方坐骑的写法、
判断某个字段该填什么。

字段模板与生成逻辑见 `backend/app/services/patch_exporter.py`：
`SPELL_COMMON_FIELDS`（共同字段）、`SPELL_TYPE_TEMPLATES`（按坐骑类型的差异）、
`SPELL_SPEED_AURA_FIELDS`（速度光环槽位）。

---

## 适用场景

- 理解坐骑法术各字段的含义与取值
- 排查构建产物里 Spell.dbc 记录是否正确
- 对照官方 3.3.5a 坐骑法术验证生成结果

## 坐骑类型速查

| 类型 | Mechanic | 挂载光环 | 速度光环 | 扩展属性 | 说明 |
|------|----------|----------|----------|----------|------|
| 陆地坐骑 | 21 | `EffectAura_1 = 78` | `EffectAura_2 = 32` | `AttributesExD = 0` | 地面移动，无区域限制 |
| 飞行坐骑 | 21 | `EffectAura_1 = 78` | `EffectAura_2 = 207` | `AttributesExD = 67108864` | 仅飞行区域可用 |
| 水上坐骑 | 21 | `EffectAura_1 = 78` | `EffectAura_2 = 58` | `AttributesExD = 0` | 游泳速度光环 |

> **注意 78 与 207 的区别**：
> - `78` = `SPELL_AURA_MOUNTED`，**挂载光环**，位于 `Effect_1` 槽位。所有坐骑都是它。
> - `207` = 飞行**速度**光环，位于 `Effect_2` 槽位，只有飞行坐骑才有。
> - `32` = 地面速度光环，`58` = 游泳速度光环，同样在 `Effect_2` 槽位。

## 核心字段

### Spell.dbc 关键字段

| 字段 | 说明 | 取值 |
|------|------|------|
| `Mechanic` | 机制类型 | **21** (MOUNT) |
| `Effect_1` | 效果 1 类型 | **6** (APPLY_AURA) |
| `EffectAura_1` | 挂载光环 | **78** (SPELL_AURA_MOUNTED) |
| `EffectMiscValue_1` | **挂载的生物 entry** | `creature_template.entry`（如 9140000） |
| `Effect_2` / `EffectAura_2` | 速度光环 | 陆地 32 / 飞行 207 / 水上 58 |
| `EffectBasePoints_2` | 速度百分比 | `speed − 1`（配 `EffectDieSides_2 = 1`） |
| `Attributes` | 基础属性 | 陆地 269844752 / 飞行 269844496 |
| `AttributesExD` | 扩展属性 D | 0，或飞行坐骑的 67108864 |
| `AttributesExC` | 扩展属性 C | 536870912 |
| `AttributesExF` | 扩展属性 F | 131072 |
| `SpellVisualID_1` | 视觉 ID | 陆地 5160 / 飞行 7644 |
| `Name_Lang_deDE` | 名称 | **写 deDE 列**，`zhCN` 列恒为空（MCC 全部数据如此） |
| `Description_Lang_deDE` | 描述 | 同上 |
| `Name_Lang_Mask` | 语言掩码 | 16712190 |

### 关键 Attributes 标志位

```cpp
// SPELL_ATTR4 (AttributesExD)
SPELL_ATTR4_ONLY_FLYING_AREAS = 0x00400000  // 67108864，只能在飞行区域使用
```

### 挂载生物是怎么被解析的

服务端 `HandleAuraMounted`（`src/server/game/Spells/Auras/SpellAuraEffects.cpp`）
拿 **Spell 的 `EffectMiscValue_1` 当作 `creature_template.entry`** 去查生物模板，
再从生物模板取显示模型。

**因此法术本身不携带 display id**：

```
dbc.spell.visual_id  ==  db.creature_template.entry  ==  Spell.dbc.EffectMiscValue_1
```

三者必须一致，否则召唤出来是别的模型（或空模型）。这一条由构建期的
`entry_visual` 校验检查。

## 控制优先级（从高到低）

1. **服务器端硬编码** (SpellMgr.cpp case 判断) — 最优先
2. **DBC Attributes 标志位** — 户外/飞行区域限制
3. **DBC AreaGroupId** — 特定区域限制
4. **服务器端通用规则** — 副本/战场默认禁飞等

## 常用 CLI 操作

```bash
# 查询所有坐骑法术（Mechanic=21）
uv run --project tools/wow-dbc-tool python -m wow_dbc_tool \
  query data/wow-dbc/src/dbc/Spell.dbc --filter "Mechanic=21" --json

# 读取特定 Spell ID 的详细信息
uv run --project tools/wow-dbc-tool python -m wow_dbc_tool \
  read data/wow-dbc/src/dbc/Spell.dbc --query "ID=80000" --json

# 统计各挂载光环的分布，验证生成结果是否符合预期
```

## 校验生成结果

构建产物里可以用校验报告确认：

```bash
uv run python -m app.cli patch build --jobs mount_0003 --dry-run
cat workspace/patch-jobs/mount_0003/plans/dbc-plan.yaml
```

重点看 `Spell.dbc` 那条 add 记录：
- `Effect_1 = 6`、`EffectAura_1 = 78`
- `EffectMiscValue_1` 等于 `creature_template.entry`
- `EffectAura_2` 与坐骑类型匹配（陆地 32 / 飞行 207 / 水上 58）

## 飞行区域规则速查

| 区域 | 默认飞行规则 | 备注 |
|------|-------------|------|
| 艾泽拉斯地球 (0/1) | 默认禁止 | 需服务器特殊配置或寒冷天气飞行 |
| 外域 (530) | 允许 | 需飞行技能 |
| 诺森德 (571) | 允许 | 需寒冷天气飞行 (54197) |
| 副本/战场 | 默认禁止 | 服务器端强制限制 |
| 冬拥湖 | 战斗时禁止 | 服务器端硬编码控制 |

## 注意事项

- 服务器端规则（如副本禁飞）会覆盖 DBC 中的 Attributes 设置
- 特殊坐骑（冬拥湖飞行坐骑等）需要服务器端 SpellMgr.cpp 配合
- 特性叠加（水面行走 / 水下骑乘）会占用 `Effect_3` 槽位，
  两者不能同时标注——构建期会直接报错
- 修改后务必 diff 对比，确认只修改了预期字段

## 相关文档

- [坐骑生产流程总纲](../../../docs/workflows/01坐骑生产流程总纲.md)
- [坐骑特性附录](../../../docs/workflows/02坐骑特性附录.md)
- [资源 DBC 与 SQL 实现参考](../../../docs/references/06资源DBC与SQL实现参考.md)
