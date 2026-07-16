import { Filter } from "lucide-react";
import { STATUS_OPTIONS } from "../lib/resource-list";

interface ResourceFiltersProps {
  typeParam: "all" | "mount" | "pet" | "npc";
  searchParams: URLSearchParams;
  categoryOptions: string[];
  tierOptions: string[];
  updateParam: (key: string, value: string) => void;
}

export function ResourceFilters({
  typeParam,
  searchParams,
  categoryOptions,
  tierOptions,
  updateParam,
}: ResourceFiltersProps) {
  return (
    <div className="table-toolbar">
      <div className="table-filters">
        <span className="hidden items-center gap-1.5 text-xs font-semibold text-text-tertiary sm:inline-flex">
          <Filter className="h-3.5 w-3.5" />
          筛选
        </span>
        <select
          className="filter-select"
          value={searchParams.get("category") || ""}
          onChange={(e) => updateParam("category", e.target.value)}
        >
          <option value="">
            所有{typeParam === "mount" ? "类型" : "分类"}
          </option>
          {categoryOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={searchParams.get("tier") || ""}
          onChange={(e) => updateParam("tier", e.target.value)}
        >
          <option value="">
            所有{typeParam === "mount" ? "星级" : "稀有度"}
          </option>
          {tierOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={searchParams.get("status") || ""}
          onChange={(e) => updateParam("status", e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="table-filters">
        <button className="btn btn-sm" onClick={() => window.location.reload()}>
          刷新
        </button>
        <button className="btn btn-sm" disabled title="导出功能开发中">
          导出当前页
        </button>
      </div>
    </div>
  );
}
