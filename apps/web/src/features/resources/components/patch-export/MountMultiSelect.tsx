import { useMemo, useState } from "react";
import { useResourceListData } from "@/features/resources/hooks/useResourceListData";
import { MountSelectRow } from "./MountSelectRow";
import { MountSelectFilters } from "./MountSelectFilters";
import type { MountStatusFilter } from "./MountSelectFilters";

interface MountMultiSelectProps {
  selected: number[];
  onChange: (ids: number[]) => void;
}

/** 向导第⑥步的坐骑多选：富信息行（缩略图/状态/星级/载具/功能）+ 精细筛选。 */
export function MountMultiSelect({
  selected,
  onChange,
}: MountMultiSelectProps) {
  const { allItems: mounts, isLoading } = useResourceListData("mount");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MountStatusFilter>("");
  const [tier, setTier] = useState("");
  const [vehicleOnly, setVehicleOnly] = useState(false);

  const tierOptions = useMemo(() => {
    const values = new Set<string>();
    for (const m of mounts ?? []) {
      if (m.star_rating) values.add(m.star_rating);
    }
    return [...values].sort();
  }, [mounts]);

  const filtered = useMemo(() => {
    if (!mounts) return [];
    const q = search.trim().toLowerCase();
    return mounts.filter((m) => {
      if (q) {
        const haystack = [
          m.name ?? "",
          m.model_folder,
          String(m.id),
        ].join(" ");
        if (!haystack.toLowerCase().includes(q)) return false;
      }
      if (status === "added" && !m.added) return false;
      if (status === "not_added" && m.added) return false;
      if (tier && m.star_rating !== tier) return false;
      if (vehicleOnly && m.vehicle == null) return false;
      return true;
    });
  }, [mounts, search, status, tier, vehicleOnly]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const vehicleMountCount = useMemo(() => {
    if (!mounts) return 0;
    const mountById = new Map(mounts.map((m) => [m.id, m]));
    return selected.filter((id) => mountById.get(id)?.vehicle != null).length;
  }, [mounts, selected]);

  const toggle = (id: number) => {
    const next = new Set(selectedSet);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange([...next].sort((a, b) => a - b));
  };

  const selectFiltered = () => {
    const next = new Set(selectedSet);
    for (const m of filtered) next.add(m.id);
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <div>
      <MountSelectFilters
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        tier={tier}
        onTierChange={setTier}
        tierOptions={tierOptions}
        vehicleOnly={vehicleOnly}
        onVehicleOnlyChange={setVehicleOnly}
        filteredCount={filtered.length}
        selectedCount={selected.length}
        onSelectFiltered={selectFiltered}
        onClear={() => onChange([])}
      />

      <div className="grid max-h-[480px] grid-cols-1 gap-px overflow-y-auto rounded-md border border-border bg-border md:grid-cols-2 2xl:grid-cols-3">
        {isLoading && (
          <div className="bg-bg-surface py-8 text-center text-sm text-text-tertiary md:col-span-2 2xl:col-span-3">
            加载中...
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="bg-bg-surface py-8 text-center text-sm text-text-tertiary md:col-span-2 2xl:col-span-3">
            无匹配坐骑
          </div>
        )}
        {filtered.map((m) => (
          <MountSelectRow
            key={m.id}
            resource={m}
            selected={selectedSet.has(m.id)}
            onToggle={toggle}
          />
        ))}
      </div>

      {vehicleMountCount > 0 && (
        <p className="mt-2 text-xs text-text-secondary">
          批次内{" "}
          <span className="font-semibold text-blue-500">
            {vehicleMountCount}
          </span>{" "}
          只载具坐骑，构建时将额外生成 Vehicle.dbc（自建时）/
          npc_spellclick_spells / vehicle_template_accessory 产物并打包进 MPQ。
        </p>
      )}
    </div>
  );
}
