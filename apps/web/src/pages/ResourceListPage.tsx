import { useSearchParams, Link, useLocation } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { cn } from "@/shared/utils";
import { useEffect } from "react";
import { TYPES } from "@/features/resources/lib/resource-list";
import { useResourceListData } from "@/features/resources/hooks/useResourceListData";
import { useResourceListFilters } from "@/features/resources/hooks/useResourceListFilters";
import { ResourceFilters } from "@/features/resources/components/ResourceFilters";
import { ResourceTable } from "@/features/resources/components/ResourceTable";
import { ResourcePagination } from "@/features/resources/components/ResourcePagination";

const PAGE_SIZE = 20;

export function ResourceListPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const typeParam =
    (searchParams.get("type") as "all" | "mount" | "pet" | "npc") || "all";

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
    categoryOptions,
    tierOptions,
  } = useResourceListFilters(allItems);

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">资源列表</h1>
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
          updateParam={updateParam}
        />

        <ResourceTable
          currentItems={currentItems}
          sortKey={sortKey}
          sortOrder={sortOrder}
          setSort={setSort}
          isLoading={isLoading}
          error={error}
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
