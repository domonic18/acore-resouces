import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useResourceListData } from "@/features/resources/hooks/useResourceListData";
import { SpecialFeatureBadge } from "@/components/badges/SpecialFeatureBadge";

interface MountMultiSelectProps {
  selected: number[];
  onChange: (ids: number[]) => void;
}

export function MountMultiSelect({
  selected,
  onChange,
}: MountMultiSelectProps) {
  const { allItems: mounts, isLoading } = useResourceListData("mount");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!mounts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return mounts;
    return mounts.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(q) ||
        m.model_folder.toLowerCase().includes(q) ||
        String(m.id).includes(q),
    );
  }, [mounts, search]);

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
      <p className="mb-2 text-xs text-text-tertiary">
        第 ⑥ 步 · 勾选要制作补丁的坐骑，点下方「创建补丁任务」进入构建
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="search-box relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称 / 模型 / ID..."
          />
        </div>
        <button type="button" className="btn btn-sm" onClick={selectFiltered}>
          全选筛选结果
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange([])}
          disabled={selected.length === 0}
        >
          清空
        </button>
        <span className="text-xs text-text-secondary">
          已选{" "}
          <span className="font-semibold text-text-primary">
            {selected.length}
          </span>{" "}
          个
        </span>
      </div>

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
          <label
            key={m.id}
            className="flex cursor-pointer items-center gap-2 bg-bg-surface px-3 py-2 text-sm hover:bg-bg-hover"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(m.id)}
              onChange={() => toggle(m.id)}
              className="h-4 w-4 shrink-0 accent-blue-500"
            />
            <span className="shrink-0 font-mono text-xs text-text-tertiary">
              #{String(m.id).padStart(4, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate" title={m.name || m.model_folder}>
              {m.name || m.model_folder}
            </span>
            {m.vehicle && (
              <span
                className="badge badge-blue shrink-0"
                title="已配置载具：导出时将生成 Vehicle.dbc / npc_spellclick_spells 产物"
              >
                载具
              </span>
            )}
            {m.special_features?.map((feature) => (
              <SpecialFeatureBadge key={feature} feature={feature} />
            ))}
            <span className="shrink-0 text-xs text-text-tertiary">
              {m.mount_type || "—"}
            </span>
          </label>
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
