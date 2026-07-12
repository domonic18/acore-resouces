# 资源 DBC 与 SQL 实现参考

## 一、概述

本文档描述在 AzerothCore 3.3.5a 中新增一个**坐骑 / 宠物 / NPC**所需要编辑的 DBC 文件、关键字段，以及需要写入 `acore-world` 数据库的 SQL 内容。所有字段命名以 `wow-dbc-tool` 的 schema 为准。

> **版本**：WoW 3.3.5a（WotLK）  
> **服务端**：AzerothCore  
> **DBC 工具**：`wow-dbc-tool`（`/Users/deadwalk/Workspace/acore-deploy/wow-dbc/tools/wow-dbc-tool`）

---

## 二、DBC 文件总览

| DBC 文件 | 作用 | 坐骑 | 宠物 | NPC |
|---------|------|:----:|:----:|:----:|
| `CreatureModelData.dbc` | 定义 `.m2` 模型路径、缩放、碰撞盒、坐骑高度等 | ✅ | ✅ | ✅ |
| `CreatureDisplayInfo.dbc` | 关联 `CreatureModelData`，定义贴图变体、显示缩放、血液/声音/粒子等 | ✅ | ✅ | ✅ |
| `CreatureDisplayInfoExtra.dbc` | 人型 NPC 的种族、性别、发型、装备显示 | ❌ | ❌ | ✅（人型） |
| `Spell.dbc` | 坐骑/宠物召唤法术、光环、效果 | ✅ | ✅ | ⚠️（部分 NPC 技能需要） |
| `SummonProperties.dbc` | 召唤物控制类型（Pet/Guardian/Mini Pet 等） | ❌ | ✅ | ❌ |
| `Item.dbc` | 物品基础类别、子类、显示信息 ID | ✅ | ✅ | ❌ |
| `ItemDisplayInfo.dbc` | 物品在背包/装备栏的图标与模型 | ✅ | ✅ | ❌ |
| `SpellIcon.dbc` / `SpellVisual.dbc` | 法术图标、视觉效果 | ✅ | ✅ | ⚠️ |

---

## 三、核心 DBC 字段详解

### 3.1 CreatureModelData.dbc

定义生物模型基础数据。

| 字段（wow-dbc-tool 名） | 类型 | 说明 | 必填 |
|------------------------|------|------|:----:|
| `ID` | int32 | 模型数据唯一 ID | ✅ |
| `Flags` | int32 | 模型标志 | ✅ |
| `ModelName` | string | `.m2` 模型路径，如 `creature\ardenwealdstag\ardenwealdstagmount.m2` | ✅ |
| `ModelScale` | float | 模型基础缩放 | ✅ |
| `BloodID` | int32 | 血液效果 ID | |
| `FootstepShakeSize` | int32 | 脚步震动大小 | |
| `CollisionWidth` | float | 碰撞宽度 | ✅ |
| `CollisionHeight` | float | 碰撞高度 | ✅ |
| `MountHeight` | float | 骑乘高度（坐骑重要） | ✅（坐骑） |
| `GeoBoxMinX/Y/Z` | float | 模型包围盒最小值 | |
| `GeoBoxMaxX/Y/Z` | float | 模型包围盒最大值 | |
| `WorldEffectScale` | float | 世界效果缩放 | |
| `AttachedEffectScale` | float | 附加效果缩放 | |
| `MissileCollisionRadius` | float | 导弹碰撞半径 | |
| `MissileCollisionPush` | float | 导弹碰撞推力 | |
| `MissileCollisionRaise` | float | 导弹碰撞抬起 | |

### 3.2 CreatureDisplayInfo.dbc

关联模型与贴图，控制生物在游戏中的显示。

| 字段（wow-dbc-tool 名） | 类型 | 说明 | 必填 |
|------------------------|------|------|:----:|
| `ID` | int32 | DisplayID，被 Spell / creature_template 引用 | ✅ |
| `ModelID` | int32 | 关联 `CreatureModelData.ID` | ✅ |
| `SoundID` | int32 | 声音 Kit ID | |
| `ExtendedDisplayInfoID` | int32 | 扩展显示信息（装备/人脸等） | |
| `CreatureModelScale` | float | 显示缩放 | ✅ |
| `CreatureModelAlpha` | int32 | 透明度 | |
| `TextureVariation_1` | string | 贴图变体 1（如 `ardenwealdstagmount_blue`） | |
| `TextureVariation_2` | string | 贴图变体 2 | |
| `TextureVariation_3` | string | 贴图变体 3 | |
| `PortraitTextureName` | string | 肖像贴图 | |
| `BloodLevel` | int32 | 血液等级 | |
| `BloodID` | int32 | 血液效果 ID | |
| `NPCSoundID` | int32 | NPC 声音 ID | |
| `ParticleColorID` | int32 | 粒子颜色 ID | |
| `CreatureGeosetData` | int32 | Geoset 数据 | |
| `ObjectEffectPackageID` | int32 | 对象效果包 ID | |

### 3.3 Spell.dbc

坐骑和宠物的召唤/使用都依赖 Spell.dbc。

#### 3.3.1 坐骑 Spell 关键字段

| 字段（wow-dbc-tool 名） | 类型 | 说明 | 推荐值 |
|------------------------|------|------|--------|
| `ID` | int32 | Spell 唯一 ID | 80000+ |
| `Mechanic` | int32 | 机制类型 | 21 = MOUNT |
| `Attributes` | int32 | 基础属性 | 0 或 2147483648（户外） |
| `AttributesExD` | int32 | 扩展属性 4 | 0（陆地） / 67108864（仅飞行区域） |
| `Effect_3` | int32 | 第三效果类型 | 6 = Apply Aura |
| `EffectAura_3` | int32 | 第三效果 Aura | 78 = SPELL_AURA_MOUNTED |
| `EffectMiscValue_3` | int32 | 坐骑模型 ID | `CreatureDisplayInfo.ID` |
| `EffectAuraPeriod_1` | int32 | 第一速度 Aura 类型 | 32 = 地面 / 207 = 飞行 |
| `EffectAuraPeriod_2` | int32 | 第二速度 Aura 类型 | 0 或 32 |
| `EffectMechanic_1` | int32 | 第一速度基础值 | 59(60%) / 99(100%) / 149(150%) / 279(280%) |
| `EffectMechanic_2` | int32 | 第二速度基础值 | 0 或 99 |
| `EffectSpellClassMaskC_3` | int32 | 法术类别掩码 | 7644（标准坐骑） |
| `AreaGroupId` | int32 | 区域组限制 | 0 = 无限制 |
| `SpellIconID` | int32 | 法术图标 ID | |
| `Name_Lang_zhCN` | string | 中文名称 | |
| `Description_Lang_zhCN` | string | 中文描述 | |

#### 3.3.2 坐骑类型速查

| 类型 | `EffectAuraPeriod_1` | `EffectAuraPeriod_2` | `EffectMechanic_1` | `EffectMechanic_2` | `AttributesExD` |
|------|:--------------------:|:--------------------:|:------------------:|:------------------:|:---------------:|
| 陆地坐骑 | 32 | 0 | 99 | 0 | 0 |
| 慢速陆地 | 32 | 0 | 59 | 0 | 0 |
| 飞行坐骑 | 207 | 32 | 279 | 99 | 67108864 |

#### 3.3.3 宠物 Spell 关键字段

| 字段（wow-dbc-tool 名） | 类型 | 说明 | 推荐值 |
|------------------------|------|------|--------|
| `ID` | int32 | Spell 唯一 ID | 80000+ |
| `Effect_1` | int32 | 第一效果类型 | 28 = SPELL_EFFECT_SUMMON |
| `EffectMiscValue_1` | int32 | 召唤生物 entry | `creature_template.entry` |
| `EffectMiscValueB_1` | int32 | SummonProperties ID | 引用 `SummonProperties.dbc` |
| `EffectAura_1` / `EffectAura_2` | int32 | 可选 Aura | 按需 |
| `SpellIconID` | int32 | 法术图标 ID | |
| `Name_Lang_zhCN` | string | 中文名称 | |

### 3.4 SummonProperties.dbc

宠物召唤属性，主要用于宠物（特别是非猎人驯服的召唤宠物）。

| 字段 | 类型 | 说明 | 推荐值 |
|------|------|------|--------|
| `ID` | int32 | 唯一 ID | |
| `Control` | int32 | 控制类型 | 0=None, 1=Guardian, **2=Pet**, 3=Possessed |
| `Title` | int32 | 召唤物标题 | 0=None, **1=Pet**, 5=Mini Pet |
| `Slot` | int32 | 召唤槽位 | |
| `Faction` | int32 | 阵营 | |

### 3.5 Item.dbc

坐骑/宠物物品基础数据。

| 字段（wow-dbc-tool 名） | 类型 | 说明 | 推荐值 |
|------------------------|------|------|--------|
| `ID` | int32 | 物品唯一 ID | 91000+ |
| `ClassID` | int32 | 物品类别 | 15 = Miscellaneous |
| `SubclassID` | int32 | 子类 | 5 = Mount |
| `DisplayInfoID` | int32 | 显示信息 ID | `ItemDisplayInfo.ID` |
| `InventoryType` | int32 | 装备位置 | 0（非装备） |
| `SheatheType` | int32 | 鞘类型 | 0 |

### 3.6 ItemDisplayInfo.dbc

定义物品图标与模型。

| 字段（wow-dbc-tool 名） | 类型 | 说明 |
|------------------------|------|------|
| `ID` | int32 | 显示信息唯一 ID |
| `ModelName_1` / `ModelName_2` | string | 物品模型路径 |
| `ModelTexture_1` / `ModelTexture_2` | int32 | 模型贴图 |
| `InventoryIcon_1` / `InventoryIcon_2` | int32 | 背包图标 |
| `GeosetGroup_1/2/3` | string/int32 | Geoset 组 |
| `Flags` | int32 | 标志 |
| `SpellVisualID` | int32 | 法术视觉效果 |
| `Texture_1` ~ `Texture_8` | int32/string | 物品贴图 |
| `ItemVisual` | int32 | 物品视觉 |
| `ParticleColorID` | int32 | 粒子颜色 |

### 3.7 CreatureDisplayInfoExtra.dbc

人型 NPC 的额外显示信息（种族、性别、装备）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `ID` | int32 | 唯一 ID |
| `DisplayRaceID` | int32 | 种族 ID |
| `DisplaySexID` | int32 | 性别（0=男，1=女） |
| `SkinID` | int32 | 皮肤 ID |
| `FaceID` | int32 | 脸型 ID |
| `HairStyleID` | int32 | 发型 ID |
| `HairColorID` | int32 | 发色 ID |
| `FacialHairID` | int32 | 面部毛发 ID |
| `NPCItemDisplay_1` ~ `NPCItemDisplay_11` | int32 | 装备显示 ID（头、肩、胸等） |

---

## 四、数据库表总览

| 表名 | 作用 | 坐骑 | 宠物 | NPC |
|------|------|:----:|:----:|:----:|
| `creature_template` | 生物模板 | ⚠️（部分需要） | ✅ | ✅ |
| `creature_template_model` | 现代 AC 中 creature_template 与 DisplayID 的关联 | ⚠️ | ✅ | ✅ |
| `creature_model_info` | DisplayID 的碰撞/战斗范围 | ✅ | ✅ | ✅ |
| `item_template` | 物品模板 | ✅ | ✅ | ❌ |
| `creature` | 生物刷新（spawn）数据 | ❌ | ⚠️（召唤宠不需要） | ✅ |
| `creature_equip_template` | NPC 装备 | ❌ | ❌ | ✅（装备型） |
| `character_pet` | 玩家已拥有宠物数据 | ❌ | ✅ | ❌ |
| `pet_spell` | 宠物技能 | ❌ | ✅ | ❌ |

### 4.1 creature_template 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry` | int | 生物唯一 entry |
| `name` | varchar | 名称 |
| `subname` | varchar | 副标题 |
| `minlevel` / `maxlevel` | tinyint | 等级范围 |
| `faction` | smallint | 阵营 |
| `npcflag` | int | NPC 交互标志 |
| `speed_walk` / `speed_run` | float | 行走/奔跑速度 |
| `scale` | float | 缩放 |
| `rank` | tinyint | 等级（普通/精英/首领） |
| `type` | tinyint | 生物类型 |
| `type_flags` | int | 类型标志 |
| `VehicleId` | int | 载具 ID |
| `AIName` | varchar | AI 脚本名（如 `SmartAI`、`PetAI`） |
| `ScriptName` | varchar | C++ 脚本名 |
| `HealthModifier` / `ManaModifier` / `DamageModifier` / `ArmorModifier` | float | 属性倍率 |

> **注意**：现代 AzerothCore 使用 `creature_template_model` 表关联 `creature_template.entry` 与 `CreatureDisplayInfo.ID`，替代了旧版的 `modelid1`/`modelid2`/`modelid3`/`modelid4` 字段。

### 4.2 creature_template_model 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `CreatureID` | int | `creature_template.entry` |
| `Idx` | tinyint | 显示索引（0~3） |
| `CreatureDisplayID` | int | `CreatureDisplayInfo.ID` |
| `DisplayScale` | float | 显示缩放 |
| `Probability` | float | 随机显示概率 |
| `VerifiedBuild` | int | 验证版本（通常 12340） |

### 4.3 creature_model_info 关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `DisplayID` | int | `CreatureDisplayInfo.ID` |
| `BoundingRadius` | float | 边界半径 |
| `CombatReach` | float | 战斗范围 |
| `Gender` | tinyint | 性别 |
| `DisplayID_Other_Gender` | int | 另一性别 DisplayID |

### 4.4 item_template 关键字段（坐骑/宠物物品）

| 字段 | 类型 | 说明 | 推荐值 |
|------|------|------|--------|
| `entry` | int | 物品唯一 ID | 91000+ |
| `name` | varchar | 物品名称 | |
| `class` | tinyint | 物品类别 | 15 = Miscellaneous |
| `subclass` | tinyint | 子类 | 5 = Mount |
| `displayid` | int | 物品显示 ID | `ItemDisplayInfo.ID` |
| `spellid_1` ~ `spellid_5` | int | 物品触发的 spell | 坐骑/宠物 spell ID |
| `spelltrigger_1` ~ `spelltrigger_5` | tinyint | 触发方式 | 0 = Use |
| `spellcharges_1` ~ `spellcharges_5` | int | 使用次数 | 0 = 无限 |
| `RequiredLevel` | tinyint | 需求等级 | |
| `RequiredSkill` / `RequiredSkillRank` | smallint | 骑术/技能需求 | |
| `AllowableClass` / `AllowableRace` | int | 可用职业/种族掩码 | |
| `bonding` | tinyint | 绑定类型 | 1=拾取绑定 / 2=装备绑定 / 3=使用绑定 |

---

## 五、ID 区间规划

为避免与官方数据冲突，自定义资源使用独立 ID 区间：

| 资源 | DBC/DB ID 起始 | 说明 |
|------|---------------|------|
| `CreatureModelData.ID` | 4000+ | 自定义模型数据 |
| `CreatureDisplayInfo.ID` | 140000+ | 自定义显示数据 |
| `Spell.ID` | 80000+ | 自定义法术 |
| `Item.ID` / `item_template.entry` | 91000+ | 自定义物品 |
| `ItemDisplayInfo.ID` | 自定义区间 | 自定义物品显示 |
| `SummonProperties.ID` | 自定义区间 | 自定义召唤属性 |
| `creature_template.entry` | 9140000+ | 自定义生物 |

---

## 六、端到端实现清单

### 6.1 添加一个坐骑

#### DBC 编辑

1. **CreatureModelData.dbc**
   - 新增记录，设置 `ModelName` 为 `.m2` 路径。
   - 设置 `ModelScale`、`CollisionWidth`、`CollisionHeight`、`MountHeight`。

2. **CreatureDisplayInfo.dbc**
   - 新增记录，`ModelID` 指向 `CreatureModelData.ID`。
   - 设置 `CreatureModelScale`、`TextureVariation_1/2/3`。

3. **Spell.dbc**
   - 新增坐骑 spell，复制已有坐骑作为模板。
   - 设置 `Mechanic=21`、`Effect_3=6`、`EffectAura_3=78`。
   - `EffectMiscValue_3` = `CreatureDisplayInfo.ID`。
   - 按陆地/飞行类型配置 `EffectAuraPeriod_*`、`EffectMechanic_*`、`AttributesExD`。
   - 设置中文名称 `Name_Lang_zhCN`。

4. **Item.dbc**（可选，如果通过物品学习/使用）
   - 新增记录，`ClassID=15`、`SubclassID=5`。
   - `DisplayInfoID` 指向 `ItemDisplayInfo.ID`。

5. **ItemDisplayInfo.dbc**（可选）
   - 新增记录，配置 `InventoryIcon_1` 等图标字段。

#### SQL 写入

1. **creature_model_info**
   - 插入 `DisplayID` = `CreatureDisplayInfo.ID`。
   - 设置 `BoundingRadius`、`CombatReach`。

2. **item_template**（可选）
   - 插入物品记录，`class=15`、`subclass=5`。
   - `displayid` = `ItemDisplayInfo.ID`。
   - `spellid_1` = 坐骑 spell ID，`spelltrigger_1=0`。
   - 配置 `RequiredSkill` / `RequiredSkillRank` 等。

3. 如坐骑需要对应生物实体（少数情况），再写入 `creature_template` + `creature_template_model`。

#### 部署

- 服务端：执行 `acore-update-dbc.sh` 同步 DBC，重启 `ac-worldserver`。
- 客户端：将修改后的 DBC 打包为 MPQ 补丁放入 `Data/` 目录，清除缓存。

---

### 6.2 添加一个宠物

#### DBC 编辑

1. **CreatureModelData.dbc** / **CreatureDisplayInfo.dbc**
   - 同 NPC 流程，配置宠物模型与显示。

2. **Spell.dbc**
   - 新增召唤 spell，`Effect_1=28`（Summon）。
   - `EffectMiscValue_1` = `creature_template.entry`。
   - `EffectMiscValueB_1` = `SummonProperties.ID`。

3. **SummonProperties.dbc**
   - 新增记录，`Control=2`（Pet），`Title=1`（Pet）或 `5`（Mini Pet）。

4. **Item.dbc** / **ItemDisplayInfo.dbc**（可选）
   - 如果宠物通过物品召唤/学习，配置物品。

#### SQL 写入

1. **creature_template**
   - 插入宠物生物模板，`type` 设置为对应类型，`AIName` 可选 `PetAI`。

2. **creature_template_model**
   - 关联 `creature_template.entry` 与 `CreatureDisplayInfo.ID`。

3. **creature_model_info**
   - 插入 DisplayID 的模型信息。

4. **item_template**（可选）
   - 如果通过物品召唤，配置物品触发宠物 spell。

5. **pet_spell**（可选）
   - 配置宠物默认技能。

---

### 6.3 添加一个 NPC

#### DBC 编辑

1. **CreatureModelData.dbc** / **CreatureDisplayInfo.dbc**
   - 配置 NPC 模型与显示。

2. **CreatureDisplayInfoExtra.dbc**（人型 NPC）
   - 设置 `DisplayRaceID`、`DisplaySexID`、发型/脸型等。
   - 设置 `NPCItemDisplay_1` ~ `NPCItemDisplay_11` 装备显示。

3. **Spell.dbc**（仅当 NPC 使用自定义技能时）
   - 配置 NPC 技能 spell。

#### SQL 写入

1. **creature_template**
   - 插入 NPC 模板，设置 `name`、`subname`、`faction`、`npcflag`、`type`、`AIName` 等。

2. **creature_template_model**
   - 关联 entry 与 `CreatureDisplayInfo.ID`。

3. **creature_model_info**
   - 插入 DisplayID 的模型信息。

4. **creature_equip_template**（装备型 NPC）
   - 配置 NPC 装备。

5. **creature**
   - 配置 NPC 刷新位置（spawn）。

---

## 七、关联关系图

```
坐骑实现链路：
CreatureModelData.dbc ──► CreatureDisplayInfo.dbc ──► Spell.dbc
                              ▲                           │
                              │                           │ EffectMiscValue_3
                              │                           ▼
                    creature_model_info          item_template.spellid_*
                              │                           ▲
                              │                           │
                              └────── creature_template ────┘
                                      （部分坐骑需要）

宠物实现链路：
CreatureModelData.dbc ──► CreatureDisplayInfo.dbc
        ▲                         │
        │                         │
        └──── creature_template ◄─┘
                 ▲
                 │ EffectMiscValue_1
              Spell.dbc ◄── SummonProperties.dbc
                 │
          item_template.spellid_*

NPC 实现链路：
CreatureModelData.dbc ──► CreatureDisplayInfo.dbc ◄── CreatureDisplayInfoExtra.dbc（人型）
        ▲                         │
        │                         │
        └──── creature_template ◄─┘
                 │
         creature_template_model
                 │
            creature_model_info
                 │
         creature_equip_template（装备）
                 │
              creature（spawn）
```

---

## 八、常见错误与注意事项

1. **字段名偏移**：`wow-dbc-tool` 的字段名与 AzerothCore 源码 `SpellEntry` 不完全一致，操作时必须以 `wow-dbc-tool` 的 `Spell.schema.json` 为准。
2. **速度 Aura 与基础值必须配对**：只改 `EffectAuraPeriod_*` 不改 `EffectMechanic_*` 会导致速度异常。
3. **客户端与服务端同步**：修改 DBC 后，服务端 `data/dbc/` 和客户端 MPQ 补丁必须同步更新，并清除客户端缓存。
4. **CreatureDisplayInfo 与 creature_model_info**：AzerothCore 要求 `creature_model_info` 中存在对应 DisplayID，否则模型可能无法加载。
5. **现代 AC 使用 creature_template_model**：不要只写 `creature_template.modelid1`，应同时写入 `creature_template_model`。
6. **坐骑不一定需要 creature_template**：坐骑的核心链路是 Spell.dbc → CreatureDisplayInfo.dbc；creature_template 只在需要生物实体时添加。

---

## 九、参考来源

- [AzerothCore Wiki – creature_template](https://www.azerothcore.org/wiki/creature_template)
- [AzerothCore Wiki – creature_model_info](https://www.azerothcore.org/wiki/creature_model_info)
- [AzerothCore Wiki – item_template](https://www.azerothcore.org/wiki/item_template)
- [AzerothCore Wiki – summonproperties_dbc](https://www.azerothcore.org/wiki/summonproperties_dbc)
- [AzerothCore Wiki – Spell Aura Reference](https://www.azerothcore.org/wiki/spell-aura-reference)
- [AzerothCore Wiki – Spell Effects Reference](https://www.azerothcore.org/wiki/spell-effects-reference)
- [TrinityCore DBC Wiki – Spell.dbc](https://trinitycore.info/files/DBC/335/spell)
- [TrinityCore DBC Wiki – CreatureDisplayInfo.dbc](https://trinitycore.info/files/DBC/335/creaturedisplayinfo)
- [wowdev.wiki – DB/Spell](https://wowdev.wiki/DB/Spell)
- [OwnedCore – Adding Custom Mount Spell](https://www.ownedcore.com/forums/world-of-warcraft/world-of-warcraft-emulator-servers/wow-emu-questions-requests/758108-how-do-i-patch-my-spells-dbc-adding-custom-mount.html)
- [AzerothCore GitHub – Creating Custom Items DBC](https://github.com/azerothcore/azerothcore-wotlk/discussions/4238)
