import { useSearchParams, useLocation } from "react-router-dom";
import { Search, X } from "lucide-react";
import { cn } from "@/shared/utils";
import { useEffect, useMemo, useState } from "react";
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
import {
  toJobMap,
  useMountPatchJobs,
} from "@/features/resources/hooks/useMountPatchJobs";

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
    clearSearch,
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

  // 补丁任务状态：让列表页直接显示每只坐骑在补丁流水线上的位置
  const patchJobsQuery = useMountPatchJobs();
  const patchJobMap = useMemo(
    () => toJobMap(patchJobsQuery.data ?? []),
    [patchJobsQuery.data],
  );

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

  // 选中的坐骑对象（对话框里要显示名称与预检结果）
  const selectedResources = useMemo(
    () => (allItems ?? []).filter((item) => selectedIds.includes(item.id)),
    [allItems, selectedIds],
  );

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">资源表格</h1>
        <div className="topbar-actions">
          <div className={cn("search-box", searchInput && "has-clear")}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="搜索名称、ID、模型/M2 文件..."
            />
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            {searchInput && (
              <button
                type="button"
                className="search-clear"
                onClick={clearSearch}
                title="清空搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
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

        <div className="flex items-center justify-between gap-4 border-b border-border bg-bg-surface px-5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
            {selectedResources.length > 0 ? (
              <>
                <span className="shrink-0">已选</span>
                <span className="font-semibold tabular-nums text-text-primary">
                  {selectedResources.length}
                </span>
                <span className="shrink-0">项：</span>
                {selectedResources.slice(0, 4).map((item) => (
                  <span
                    key={item.id}
                    className="badge badge-gray max-w-[12rem] truncate"
                    title={item.name || item.model_folder}
                  >
                    {item.name || item.model_folder}
                  </span>
                ))}
                {selectedResources.length > 4 && (
                  <span className="shrink-0 text-text-tertiary">
                    等 {selectedResources.length} 项
                  </span>
                )}
              </>
            ) : (
              <span className="text-text-tertiary">
                勾选坐骑后即可批量创建补丁任务
              </span>
            )}
          </div>
          <div className="shrink-0">
            <BulkPatchExportButton
              resources={selectedResources}
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
          showFeatures={typeParam === "mount" || typeParam === "all"}
          showPatchStatus={typeParam === "mount"}
          patchJobs={patchJobMap}
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
