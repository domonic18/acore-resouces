import type { VehicleConfig } from "@/shared/types";

/** 官方多座载具：复用时零 DBC 改动；312 乘客槽位 SeatID_2/3，315 为 SeatID_1/2 */
export const OFFICIAL_MULTI_SEAT_VEHICLE_IDS = [312, 315] as const;

export const DEFAULT_SPELLCLICK_SPELL_ID = 46598;

export const OFFICIAL_VEHICLE_OPTIONS: { id: number; label: string }[] = [
  { id: 312, label: "官方 312（乘客槽位 SeatID_2/3）" },
  { id: 315, label: "官方 315（乘客槽位 SeatID_1/2）" },
];

/**
 * 勾选特殊功能标签时的预填草稿：
 * - 双人骑乘：自建 1 座载具，vehicle_id = 0 表示待分配（点「建议空闲 ID」写死）
 * - 三人骑乘：复用官方 312
 */
export function buildVehicleDraft(kind: "double" | "triple"): VehicleConfig {
  if (kind === "triple") {
    return {
      vehicle_id: 312,
      seat_ids: [],
      spellclick_spell_id: DEFAULT_SPELLCLICK_SPELL_ID,
      accessories: [],
    };
  }
  return {
    vehicle_id: 0,
    seat_ids: [2764],
    spellclick_spell_id: DEFAULT_SPELLCLICK_SPELL_ID,
    accessories: [],
  };
}

export function isOfficialVehicleId(vehicleId: number): boolean {
  return (OFFICIAL_MULTI_SEAT_VEHICLE_IDS as readonly number[]).includes(
    vehicleId,
  );
}
