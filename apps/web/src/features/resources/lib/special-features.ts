/**
 * 坐骑特殊功能的元数据。
 *
 * 词表与后端 backend/app/schemas/resource.py 的 SPECIAL_FEATURES 严格一致
 * （顺序也一致）；后端写入时会静默丢弃词表外的值。
 *
 * 说明文案对应 docs/workflows/02坐骑特性附录.md 的各特性小节，
 * 靠 docAnchor 与文档对齐。
 */

export type FeatureTone =
  | "blue"
  | "purple"
  | "green"
  | "orange"
  | "cyan"
  | "teal"
  | "gray";

export interface SpecialFeatureMeta {
  /** 与后端词表一致的取值 */
  value: string;
  /** 徽标短标签 */
  label: string;
  /** 说明文案：编辑页与 tooltip 共用 */
  description: string;
  tone: FeatureTone;
  /** 是否必须同时配置 vehicle 块 */
  requiresVehicle: boolean;
  /** 对应文档锚点 */
  docAnchor: string;
}

export const SPECIAL_FEATURE_META: SpecialFeatureMeta[] = [
  {
    value: "三人骑乘",
    label: "三人",
    description:
      "两名乘客可乘。复用官方 Vehicle.dbc 记录 312（0 座驾驶员 + 2 座乘客），需在 YAML 配置 vehicle 块与 seat_ids。",
    tone: "blue",
    requiresVehicle: true,
    docAnchor: "2-1-multi-seat",
  },
  {
    value: "双人骑乘",
    label: "双人",
    description:
      "一名乘客可乘。3.3.5 没有官方双人载具记录，必须自建 Vehicle.dbc 记录（建议 ID 90000 起空闲号段）。",
    tone: "blue",
    requiresVehicle: true,
    docAnchor: "2-1-multi-seat",
  },
  {
    value: "自带商人",
    label: "商人",
    description:
      "载具挂载官方商贩挂件（杂货 32638/32642、材料修理 32639/32641），玩家可在坐骑上买卖。需先配置 vehicle 块。",
    tone: "orange",
    requiresVehicle: true,
    docAnchor: "2-7-vendor-repair",
  },
  {
    value: "自带拍卖行",
    label: "拍卖",
    description:
      "载具挂载官方拍卖师挂件（联盟 8670、部落 8673、中立 8661），点击直接打开拍卖行。需先配置 vehicle 块。",
    tone: "purple",
    requiresVehicle: true,
    docAnchor: "2-6-auctioneer",
  },
  {
    value: "修理",
    label: "修理",
    description:
      "载具挂载官方修理商挂件（材料修理 32639/32641），玩家可在坐骑上修理。需先配置 vehicle 块。",
    tone: "orange",
    requiresVehicle: true,
    docAnchor: "2-7-vendor-repair",
  },
  {
    value: "水面行走",
    label: "水面",
    description:
      "召唤法术第三效果追加 WATER_WALK(104) 光环，坐骑可在水面上行走。不能与「水下骑乘」同时标注（第三效果槽位冲突）。",
    tone: "cyan",
    requiresVehicle: false,
    docAnchor: "2-2-water-walk",
  },
  {
    value: "水下骑乘",
    label: "水下",
    description:
      "召唤法术带游泳速度光环（aura 58），数值取 spell.swim_speed（缺省 60，写入 EffectBasePoints = 值 - 1）。",
    tone: "teal",
    requiresVehicle: false,
    docAnchor: "2-3-swim",
  },
  {
    value: "骑乘采集",
    label: "采集",
    description:
      "客户端剥皮（纯 DBC）与服务端采药/采矿（核心补丁）两条路径，需要额外脚本与 SQL，尚未纳入补丁管线。",
    tone: "green",
    requiresVehicle: false,
    docAnchor: "2-4-gathering",
  },
  {
    value: "变色涂装",
    label: "变色",
    description:
      "通过多组 CreatureDisplayInfo 记录 + 切换法术实现换色，需要客户端额外资源，尚未纳入补丁管线。",
    tone: "purple",
    requiresVehicle: false,
    docAnchor: "2-5-recolor",
  },
];

export function getFeatureMeta(value: string): SpecialFeatureMeta | undefined {
  return SPECIAL_FEATURE_META.find((meta) => meta.value === value);
}

/** 供筛选器与表单使用的选项列表（下拉里用完整名称，徽标用短标签） */
export const SPECIAL_FEATURE_OPTIONS: { value: string; label: string }[] =
  SPECIAL_FEATURE_META.map((meta) => ({ value: meta.value, label: meta.value }));

/** 需要同时配置 vehicle 块的特性取值 */
export const VEHICLE_REQUIRED_FEATURES = SPECIAL_FEATURE_META.filter(
  (meta) => meta.requiresVehicle,
).map((meta) => meta.value);
