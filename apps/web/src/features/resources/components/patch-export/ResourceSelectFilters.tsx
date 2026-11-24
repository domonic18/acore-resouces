import { Search } from "lucide-react";

export type ResourceStatusFilter = "" | "added" | "not_added";

interface ResourceSelectFiltersProps {
  /** 资源类型：星级/仅载具筛选仅坐骑展示 */
  resourceType: string;
  search: string;
  onSearchChange: (value: string) => void;
  status: ResourceStatusFilter;
  onStatusChange: (value: ResourceStatusFilter) => void;
  tier: string;
  onTierChange: (value: string) => void;
  tierOptions: string[];
  vehicleOnly: boolean;
  onVehicleOnlyChange: (value: boolean) => void;
  filteredCount: number;
  selectedCount: number;
  onSelectFiltered: () => void;
  onClear: () => void;
}

/** 向导资源多选的筛选行：搜索 + 状态（通用）；星级/载具仅坐骑 + 全选/清空/计数 */
export function ResourceSelectFilters({
  resourceType,
  search,
  onSearchChange,
  status,
  onStatusChange,
  tier,
  onTierChange,
  tierOptions,
  vehicleOnly,
  onVehicleOnlyChange,
  filteredCount,
  selectedCount,
  onSelectFiltered,
  onClear,
}: ResourceSelectFiltersProps) {
  const isMount = resourceType === "mount";
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="search-box relative min-w-52 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索名称 / 模型 / ID..."
          />
        </div>
        <select
          className="filter-select"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as ResourceStatusFilter)}
          title="按上线状态过滤"
        >
          <option value="">全部状态</option>
          <option value="added">已添加</option>
          <option value="not_added">未添加</option>
        </select>
        {isMount && (
          <>
            <select
              className="filter-select"
              value={tier}
              onChange={(e) => onTierChange(e.target.value)}
              title="按星级/稀有度过滤"
            >
              <option value="">所有星级</option>
              {tierOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={vehicleOnly}
                onChange={(e) => onVehicleOnlyChange(e.target.checked)}
                className="h-3.5 w-3.5 accent-blue-500"
              />
              仅载具
            </label>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm" onClick={onSelectFiltered}>
          全选筛选结果
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onClear}
          disabled={selectedCount === 0}
        >
          清空
        </button>
        <span className="text-xs text-text-secondary">
          匹配 {filteredCount} 个 · 已选{" "}
          <span className="font-semibold text-text-primary">{selectedCount}</span>{" "}
          个
        </span>
      </div>
    </div>
  );
}
