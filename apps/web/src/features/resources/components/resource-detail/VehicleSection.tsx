import { useState } from "react";
import { SectionCard } from "@/components/form/SectionCard";
import { FormGroup } from "@/components/form/FormGroup";
import { FieldHint } from "@/components/form/FieldHint";
import { cn } from "@/shared/utils";
import { fetchNextFreeId } from "@/shared/dbc";
import type { VehicleAccessory, VehicleConfig } from "@/shared/types";
import {
  buildVehicleDraft,
  isOfficialVehicleId,
  OFFICIAL_VEHICLE_OPTIONS,
} from "../../lib/vehicle";

interface VehicleSectionProps {
  vehicle: VehicleConfig | null;
  setVehicle: (vehicle: VehicleConfig | null) => void;
  specialFeatures: string[];
  compact?: boolean;
}

export function VehicleSection({
  vehicle,
  setVehicle,
  specialFeatures,
  compact,
}: VehicleSectionProps) {
  const inputCls = cn(compact ? "form-input-compact" : "form-input");
  const selectCls = cn(compact ? "form-select-compact" : "form-select");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!vehicle) {
    const kind = specialFeatures.includes("三人骑乘") ? "triple" : "double";
    return (
      <SectionCard title="载具配置" compact={compact}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            已勾选多人骑乘标签但尚未配置载具。启用后导出补丁时将自动生成
            Vehicle.dbc / npc_spellclick_spells / vehicle_template_accessory
            产物。
          </p>
          <button
            type="button"
            className="btn-secondary whitespace-nowrap"
            onClick={() => setVehicle(buildVehicleDraft(kind))}
          >
            启用载具配置
          </button>
        </div>
      </SectionCard>
    );
  }

  const isOfficial = isOfficialVehicleId(vehicle.vehicle_id);

  const patchVehicle = (patch: Partial<VehicleConfig>) =>
    setVehicle({ ...vehicle, ...patch });

  const patchAccessory = (index: number, patch: Partial<VehicleAccessory>) => {
    const accessories = vehicle.accessories.map((acc, i) =>
      i === index ? { ...acc, ...patch } : acc,
    );
    patchVehicle({ accessories });
  };

  const suggestFreeId = async () => {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const result = await fetchNextFreeId("Vehicle", 90000);
      patchVehicle({ vehicle_id: result.next_free_id });
    } catch (error) {
      setSuggestError(error instanceof Error ? error.message : "建议失败");
    } finally {
      setSuggesting(false);
    }
  };

  const updateSeat = (index: number, value: string) => {
    const seatIds = [...vehicle.seat_ids];
    seatIds[index] = Number(value) || 0;
    patchVehicle({ seat_ids: seatIds });
  };

  return (
    <SectionCard title="载具配置" compact={compact}>
      <div className={cn("form-grid", compact && "form-grid-compact")}>
        <FormGroup
          label="载具来源"
          hint={
            <FieldHint description="复用官方多座载具（312/315）零 DBC 改动；自建记录用于双人骑乘，生成 Vehicle.dbc" />
          }
        >
          <select
            className={selectCls}
            value={isOfficial ? String(vehicle.vehicle_id) : "custom"}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "custom") {
                patchVehicle({
                  vehicle_id: isOfficial ? 0 : vehicle.vehicle_id,
                  seat_ids:
                    vehicle.seat_ids.length > 0 ? vehicle.seat_ids : [2764],
                });
              } else {
                patchVehicle({ vehicle_id: Number(value), seat_ids: [] });
              }
            }}
          >
            {OFFICIAL_VEHICLE_OPTIONS.map((opt) => (
              <option key={opt.id} value={String(opt.id)}>
                {opt.label}
              </option>
            ))}
            <option value="custom">自建 Vehicle.dbc 记录</option>
          </select>
        </FormGroup>

        {!isOfficial && (
          <FormGroup
            label="Vehicle ID"
            hint={
              <FieldHint description="项目号段 90000 起；保存时写死到 YAML，构建时生成 Vehicle.dbc 记录" />
            }
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                className={inputCls}
                value={vehicle.vehicle_id || ""}
                placeholder="待分配"
                onChange={(e) =>
                  patchVehicle({ vehicle_id: Number(e.target.value) || 0 })
                }
              />
              <button
                type="button"
                className="btn-secondary whitespace-nowrap"
                disabled={suggesting}
                onClick={suggestFreeId}
              >
                {suggesting ? "查询中…" : "建议空闲 ID"}
              </button>
            </div>
            {vehicle.vehicle_id <= 0 && (
              <p className="mt-1 text-[11px] text-amber-500">
                尚未分配 Vehicle ID，保存时不会写入载具配置
              </p>
            )}
            {suggestError && (
              <p className="mt-1 text-[11px] text-red-500">{suggestError}</p>
            )}
          </FormGroup>
        )}

        {!isOfficial && (
          <FormGroup
            label="乘客座位（SeatID）"
            hint={
              <FieldHint description="VehicleSeat.dbc 的座位 ID，从 SeatID_1 槽位起依次填入；双人骑乘预填 2764，最多 8 个" />
            }
          >
            <div className="space-y-1.5">
              {vehicle.seat_ids.map((seatId, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-16 text-[11px] text-text-secondary">
                    SeatID_{index + 1}
                  </span>
                  <input
                    type="number"
                    className={inputCls}
                    value={seatId || ""}
                    onChange={(e) => updateSeat(index, e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-icon text-text-secondary hover:text-red-500"
                    onClick={() =>
                      patchVehicle({
                        seat_ids: vehicle.seat_ids.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {vehicle.seat_ids.length < 8 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    patchVehicle({ seat_ids: [...vehicle.seat_ids, 0] })
                  }
                >
                  + 添加座位
                </button>
              )}
            </div>
          </FormGroup>
        )}

        <FormGroup label="挂件（vehicle_template_accessory）" compact={compact}>
          <div className="space-y-1.5">
            {vehicle.accessories.map((acc, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  className={cn(inputCls, "w-28")}
                  value={acc.accessory_entry || ""}
                  placeholder="NPC entry"
                  title="挂件 NPC 的 creature_template.entry"
                  onChange={(e) =>
                    patchAccessory(index, {
                      accessory_entry: Number(e.target.value) || 0,
                    })
                  }
                />
                <input
                  type="number"
                  className={cn(inputCls, "w-20")}
                  value={acc.seat_id}
                  placeholder="seat"
                  title="座位槽位下标（0 起 = SeatID_1）"
                  min={0}
                  max={7}
                  onChange={(e) =>
                    patchAccessory(index, {
                      seat_id: Math.min(
                        7,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    })
                  }
                />
                <input
                  type="number"
                  className={cn(inputCls, "w-20")}
                  value={acc.summontype}
                  title="summontype（默认 6）"
                  onChange={(e) =>
                    patchAccessory(index, {
                      summontype: Number(e.target.value) || 0,
                    })
                  }
                />
                <input
                  type="number"
                  className={cn(inputCls, "w-24")}
                  value={acc.summontimer}
                  title="summontimer（毫秒，默认 30000）"
                  onChange={(e) =>
                    patchAccessory(index, {
                      summontimer: Number(e.target.value) || 0,
                    })
                  }
                />
                <button
                  type="button"
                  className="btn-icon text-text-secondary hover:text-red-500"
                  onClick={() =>
                    patchVehicle({
                      accessories: vehicle.accessories.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                patchVehicle({
                  accessories: [
                    ...vehicle.accessories,
                    {
                      accessory_entry: 0,
                      seat_id: 0,
                      minion: 0,
                      summontype: 6,
                      summontimer: 30000,
                    },
                  ],
                })
              }
            >
              + 添加挂件
            </button>
          </div>
        </FormGroup>

        <FormGroup label="高级设置" compact={compact}>
          <button
            type="button"
            className="text-[11px] text-accent hover:text-accent-hover"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "收起" : "展开"}登载法术设置
          </button>
          {showAdvanced && (
            <div className="mt-2">
              <label className="text-[11px] text-text-secondary">
                登载法术 ID（npc_spellclick_spells.spell_id，默认 46598）
              </label>
              <input
                type="number"
                className={cn(inputCls, "mt-1")}
                value={vehicle.spellclick_spell_id || ""}
                onChange={(e) =>
                  patchVehicle({
                    spellclick_spell_id:
                      Number(e.target.value) || vehicle.spellclick_spell_id,
                  })
                }
              />
            </div>
          )}
        </FormGroup>

        <FormGroup label="移除" compact={compact}>
          <button
            type="button"
            className="btn-secondary text-red-500"
            onClick={() => setVehicle(null)}
          >
            清除载具配置
          </button>
        </FormGroup>
      </div>
    </SectionCard>
  );
}
