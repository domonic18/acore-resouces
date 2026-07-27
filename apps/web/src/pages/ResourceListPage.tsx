import { useSearchParams, Link, useLocation } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { cn } from "@/shared/utils";
import { useEffect, useState } from "react";
import {
  TYPES,
  parseResourceType,
} from "@/features/resources/lib/resource-list";
import { useResourceListData } from "@/features/resources/hooks/useResourceListData";
import { useResourceListFilters } from "@/features/resources/hooks/useResourceListFilters";
import { ResourceFilters } from "@/features/resources/components/ResourceFilters";
import { ResourceTable } from "@/features/resources/components/ResourceTable";
import { ResourcePagination } from "@/features/resources/components/ResourcePagination";
import { BulkPatchExportButton } from "@/features/resources/components/BulkPatchExportButton";

const PAGE_SIZE = 20;

export function ResourceListPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const typeParam = parseResourceType(searchParams.get("type"));

  useEffect(() => {
    if (location.state?.restoreScroll) {
      const scrollY = sessionStorage.getItem("resourceListScrollY");
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY, 10));
        sessionStorage.removeItem("resourceListScrollY");
      }
    }
  }, [location.state]);

  const { allItems, isLoading, error, countMap } =
    useResourceListData(typeParam);

  const {
    searchInput,
    setSearchInput,
    applySearch,
    sortKey,
    sortOrder,
    setSort,
    currentItems,
    sorted,
    totalPages,
    page,
    updateParam,
    toggleParamValue,
    categoryOptions,
    tierOptions,
    tagOptions,
  } = useResourceListFilters(allItems);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const handleSelect = (id: number, selected: boolean) => {
    setSelectedIds((prev) =>
      selected ? [...prev, id] : prev.filter((itemId) => itemId !== id),
    );
  };

  const handleSelectAll = (selected: boolean) => {
    const pageIds = currentItems.map((r) => r.id);
    setSelectedIds((prev) => {
      const withoutPage = prev.filter((id) => !pageIds.includes(id));
      return selected ? [...withoutPage, ...pageIds] : withoutPage;
    });
  };

  const canBulkExport = typeParam === "mount";

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">资源表格</h1>
        <div className="topbar-actions">
          <div className="search-box">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="搜索资源名称、ID、模型文件夹..."
            />
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          </div>
          <Link to="/import" className="btn btn-primary">
            <Plus className="h-4 w-4" /> 新增资源
          </Link>
        </div>
      </header>

      <div className="card">
        <div className="tabs">
          {TYPES.map((t) => (
            <button
              key={t.key}
              className={cn("tab", typeParam === t.key && "active")}
              onClick={() => updateParam("type", t.key === "all" ? "" : t.key)}
            >
              {t.label} ({countMap[t.key] ?? "-"})
            </button>
          ))}
        </div>

        <ResourceFilters
          typeParam={typeParam}
          searchParams={searchParams}
          categoryOptions={categoryOptions}
          tierOptions={tierOptions}
          tagOptions={tagOptions}
          updateParam={updateParam}
          toggleParamValue={toggleParamValue}
        />

        <div className="flex items-center justify-between border-b border-border bg-bg-surface px-5 py-3">
          <div className="text-xs text-text-secondary">
            已选择{" "}
            <span className="font-semibold text-text-primary">
              {selectedIds.length}
            </span>{" "}
            项
          </div>
          <div
            className="flex items-center gap-3"
            title={
              canBulkExport
                ? undefined
                : "批量导出当前仅支持坐骑（mount）标签页"
            }
          >
            <BulkPatchExportButton
              resourceType="mount"
              resourceIds={selectedIds}
              disabled={!canBulkExport}
            />
          </div>
        </div>

        <ResourceTable
          currentItems={currentItems}
          sortKey={sortKey}
          sortOrder={sortOrder}
          setSort={setSort}
          isLoading={isLoading}
          error={error}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
        />

        {!isLoading && !error && (
          <ResourcePagination
            total={sorted.length}
            page={page}
            pageSize={PAGE_SIZE}
            totalPages={totalPages}
            updateParam={updateParam}
          />
        )}
      </div>
    </div>
  );
}
