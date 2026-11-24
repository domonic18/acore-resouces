import { useEffect, useMemo, useState } from "react";
import { useResourceListData } from "@/features/resources/hooks/useResourceListData";
import { ResourceSelectRow } from "./ResourceSelectRow";
import { ResourceSelectFilters } from "./ResourceSelectFilters";
import type { ResourceStatusFilter } from "./ResourceSelectFilters";
import type { PatchResourceType } from "./wizard/types";

interface ResourceMultiSelectProps {
  /** 资源类型：坐骑 / 小宠物 */
  resourceType: PatchResourceType;
  selected: number[];
  onChange: (ids: number[]) => void;
}

/** 向导第⑥步的资源多选：富信息行（缩略图/状态/星级/载具/功能）+ 精细筛选。 */
export function ResourceMultiSelect({
  resourceType,
  selected,
  onChange,
}: ResourceMultiSelectProps) {
  const { allItems: resources, isLoading } = useResourceListData(resourceType);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ResourceStatusFilter>("");
  const [tier, setTier] = useState("");
  const [vehicleOnly, setVehicleOnly] = useState(false);
  const isMount = resourceType === "mount";

  // 类型切换时筛选条件不再适用，重置（选择集由上层负责清空）
  useEffect(() => {
    setSearch("");
    setStatus("");
    setTier("");
    setVehicleOnly(false);
  }, [resourceType]);

  const tierOptions = useMemo(() => {
    const values = new Set<string>();
    for (const r of resources ?? []) {
      const value = resourceType === "pet" ? r.rarity : r.star_rating;
      if (value) values.add(value);
    }
    return [...values].sort();
  }, [resources, resourceType]);

  const filtered = useMemo(() => {
    if (!resources) return [];
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (q) {
        const haystack = [
          r.name ?? "",
          r.model_folder,
          String(r.id),
        ].join(" ");
        if (!haystack.toLowerCase().includes(q)) return false;
      }
      if (status === "added" && !r.added) return false;
      if (status === "not_added" && r.added) return false;
      if (tier) {
        const value = resourceType === "pet" ? r.rarity : r.star_rating;
        if (value !== tier) return false;
      }
      if (vehicleOnly && r.vehicle == null) return false;
      return true;
    });
  }, [resources, search, status, tier, vehicleOnly, resourceType]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const vehicleMountCount = useMemo(() => {
    if (!resources) return 0;
    const resourceById = new Map(resources.map((r) => [r.id, r]));
    return selected.filter((id) => resourceById.get(id)?.vehicle != null).length;
  }, [resources, selected]);

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
    for (const r of filtered) next.add(r.id);
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <div>
      <ResourceSelectFilters
        resourceType={resourceType}
        search={search}
        onSearchChange={setSearch}
        status={status}
        onStatusChange={setStatus}
        tier={tier}
        onTierChange={setTier}
        tierOptions={isMount ? tierOptions : []}
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
            无匹配资源
          </div>
        )}
        {filtered.map((r) => (
          <ResourceSelectRow
            key={r.id}
            resource={r}
            selected={selectedSet.has(r.id)}
            onToggle={toggle}
          />
        ))}
      </div>

      {isMount && vehicleMountCount > 0 && (
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
