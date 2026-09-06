import { Filter } from "lucide-react";
import {
  STATUS_TAG_OPTIONS,
  RESOURCE_TAG_OPTIONS,
  getUnofficialLabel,
} from "../lib/resource-list";
import type { ResourceTagValue } from "../lib/resource-list";
import { DateRangeFilter } from "./DateRangeFilter";

interface ResourceFiltersProps {
  typeParam: "all" | "mount" | "pet" | "npc";
  searchParams: URLSearchParams;
  categoryOptions: string[];
  tierOptions: string[];
  tagOptions: ResourceTagValue[];
  updateParam: (key: string, value: string) => void;
  toggleParamValue: (key: "status" | "tags", value: string) => void;
}

function FilterTag({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`badge cursor-pointer transition-colors ${
        active ? "badge-blue" : "badge-gray hover:bg-gray-500/25"
      }`}
    >
      {active ? "✓ " : ""}
      {label}
    </button>
  );
}

export function ResourceFilters({
  typeParam,
  searchParams,
  categoryOptions,
  tierOptions,
  tagOptions,
  updateParam,
  toggleParamValue,
}: ResourceFiltersProps) {
  const selectedStatuses = new Set(
    (searchParams.get("status") || "").split(",").filter(Boolean),
  );
  const selectedTags = new Set(
    (searchParams.get("tags") || "").split(",").filter(Boolean),
  );

  const handleDateChange = (start: string, end: string) => {
    updateParam("updated_start", start);
    updateParam("updated_end", end);
  };

  return (
    <div className="table-toolbar">
      <div className="table-filters flex-wrap items-start gap-y-2">
        <span className="hidden items-center gap-1.5 text-xs font-semibold text-text-tertiary sm:inline-flex">
          <Filter className="h-3.5 w-3.5" />
          筛选
        </span>
        {typeParam !== "pet" && typeParam !== "npc" && (
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
        )}
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
          value={searchParams.get("origin") || ""}
          onChange={(e) => updateParam("origin", e.target.value)}
          title="按物品 ID 是否与 wowhead 官方链接一致判定（与编辑页徽章口径一致）"
        >
          <option value="">所有数据来源</option>
          <option value="official">官方数据</option>
          <option value="custom">自定义数据</option>
        </select>

        <DateRangeFilter
          start={searchParams.get("updated_start") || ""}
          end={searchParams.get("updated_end") || ""}
          onChange={handleDateChange}
        />

        {typeParam !== "pet" && typeParam !== "npc" && (
          <FilterTag
            label="必填缺失"
            active={searchParams.get("required") === "missing"}
            onClick={() =>
              updateParam(
                "required",
                searchParams.get("required") === "missing" ? "" : "missing",
              )
            }
          />
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TAG_OPTIONS.map((opt) => (
            <FilterTag
              key={opt.value}
              label={opt.label}
              active={selectedStatuses.has(opt.value)}
              onClick={() => toggleParamValue("status", opt.value)}
            />
          ))}
        </div>
        {tagOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {RESOURCE_TAG_OPTIONS.filter((opt) =>
              tagOptions.includes(opt.value),
            ).map((opt) => (
              <FilterTag
                key={opt.value}
                label={
                  opt.value === "unofficial"
                    ? getUnofficialLabel(typeParam)
                    : opt.label
                }
                active={selectedTags.has(opt.value)}
                onClick={() => toggleParamValue("tags", opt.value)}
              />
            ))}
          </div>
        )}
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
