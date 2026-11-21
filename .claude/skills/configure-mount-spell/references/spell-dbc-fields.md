# Spell.dbc 坐骑相关字段参考

> 字段名以 `tools/wow-dbc-tool/schemas/Spell.schema.json`（3.3.5.12340）为准。
> 注意实际字段名带下划线与槽位后缀：`EffectAura_1`（不是 `EffectApplyAuraName1`）、
> `AttributesExD`（不是 `AttributesEx4`）、`EffectSpellClassMaskC_3`（3 前有下划线）。

## 核心字段表

| 字段名 | 类型 | 说明 | 坐骑取值 |
|--------|------|------|-----------|
| `ID` | uint32 | Spell 唯一标识 | 自定义段 80000+ |
| `Mechanic` | uint32 | 机制类型 | **21** = MOUNT |
| `Effect_1` | uint32 | 效果 1 类型 | **6** = APPLY_AURA |
| `EffectAura_1` | uint32 | 效果 1 的 Aura 类型 | **78** = SPELL_AURA_MOUNTED |
| `EffectMiscValue_1` | uint32 | 效果 1 的杂项值 | **`creature_template.entry`** |
| `Effect_2` / `EffectAura_2` | uint32 | 效果 2 | 速度光环：陆地 32 / 飞行 207 / 水上 58 |
| `EffectBasePoints_2` | int32 | 效果 2 基础值 | 速度百分比 − 1（配 `EffectDieSides_2 = 1`） |
| `Effect_3` / `EffectAura_3` | uint32 | 效果 3 | 特性叠加时使用（水面行走 104 等） |
| `Attributes` | uint32 | 基础属性标志 | 陆地 269844752 / 飞行 269844496 |
| `AttributesExC` | uint32 | 扩展属性 C | 536870912 |
| `AttributesExD` | uint32 | 扩展属性 D | 0，或飞行坐骑的 67108864 |
| `AttributesExF` | uint32 | 扩展属性 F | 131072 |
| `SpellVisualID_1` | uint32 | 视觉效果 ID | 陆地 5160 / 飞行 7644 |
| `Name_Lang_deDE` | string | 名称 | 写 deDE 列；`zhCN` 列恒为空 |
| `Name_Lang_Mask` | uint32 | 语言掩码 | 16712190 |
| `Description_Lang_deDE` | string | 描述 | 同上 |
| `Description_Lang_Mask` | uint32 | 语言掩码 | 16712190 |

## Mechanic 值

| 值 | 名称 | 说明 |
|----|------|------|
| 21 | MOUNT | 坐骑 |

## Aura 类型（`EffectAura_N`）

| 值 | 名称 | 槽位 | 说明 |
|----|------|------|------|
| 78 | SPELL_AURA_MOUNTED | **Effect_1** | 挂载光环——**所有坐骑都是它** |
| 32 | SPELL_AURA_MOD_INCREASE_SPEED | Effect_2 | 地面速度光环 |
| 207 | 飞行速度光环 | Effect_2 | **仅飞行坐骑**，不是挂载光环 |
| 58 | 游泳速度光环 | Effect_2 | 水上坐骑 |
| 104 | WATER_WALK | Effect_3 | 水面行走特性 |

> ⚠️ 最容易搞混的一点：**207 不是 SPELL_AURA_MOUNTED**。
> 挂载光环是 78（在 `Effect_1`），207 是飞行速度光环（在 `Effect_2`）。

## 典型坐骑 Spell 结构

```
Spell.dbc 记录（陆地坐骑）:
├── ID: [SpellID]
├── Mechanic: 21
├── Effect_1: 6 (APPLY_AURA)
├── EffectAura_1: 78 (MOUNTED)
├── EffectMiscValue_1: [creature_template.entry]   ← 挂载的生物，不是 display id
├── Effect_2: 6 (APPLY_AURA)
├── EffectAura_2: 32 (地面速度)
├── EffectBasePoints_2: [速度值 - 1]
├── EffectDieSides_2: 1
├── Attributes: 269844752
├── AttributesExC: 536870912
├── AttributesExD: 0
├── AttributesExF: 131072
├── SpellVisualID_1: 5160
└── Name_Lang_deDE: [坐骑名称]
```

## 挂载生物的解析链路

服务端 `HandleAuraMounted` 拿 `EffectMiscValue_1` 当 `creature_template.entry`，
从生物模板取显示模型。因此：

```
dbc.spell.visual_id  ==  db.creature_template.entry  ==  Spell.dbc.EffectMiscValue_1
```

三者必须一致。构建期的 `entry_visual` 校验会检查这一条。

## 标志位字段说明

### Attributes (uint32)

位掩码组合值，常见坐骑相关标志：

| 标志名 | 十六进制 | 十进制 | 说明 |
|--------|----------|--------|------|
| SPELL_ATTR0_OUTDOORS_ONLY | 0x80000000 | 2147483648 | 只能在户外使用 |

### AttributesExD (uint32)

| 标志名 | 十六进制 | 十进制 | 说明 |
|--------|----------|--------|------|
| SPELL_ATTR4_ONLY_FLYING_AREAS | 0x00400000 | 67108864 | 只能在飞行区域使用 |

## 区域限制 (AreaGroupId)

AreaGroupId 指向 AreaGroup.dbc，用于限制特定区域组可用。
设置为 0 表示无区域限制。

## 服务器端覆盖规则

即使 DBC 中配置允许飞行，服务器端仍会强制限制：

- 副本/战场默认不允许飞行
- 艾泽拉斯地球默认不允许飞行（除非服务器修改）
- 冬拥湖战斗期间不允许飞行
- 诺森德需要寒冷天气飞行技能 (Spell 54197)

## 相关文件

- 字段权威定义：`tools/wow-dbc-tool/schemas/Spell.schema.json`
- 生成模板：`backend/app/services/patch_exporter.py` 的 `SPELL_COMMON_FIELDS` / `SPELL_TYPE_TEMPLATES`
