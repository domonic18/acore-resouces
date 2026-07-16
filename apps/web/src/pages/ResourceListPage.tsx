import { useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Pencil,
  Eye,
  Filter,
} from "lucide-react";
import { fetchAllResources, getResourceCount } from "@/shared/resources";
import { ResourceThumb } from "@/components/ResourceThumb";
import { cn } from "@/shared/utils";
import type { Resource } from "@/shared/types";

const TYPES: { key: "all" | "mount" | "pet" | "npc"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "mount", label: "坐骑" },
  { key: "pet", label: "宠物" },
  { key: "npc", label: "NPC" },
];

const STATUS_OPTIONS = [
  { value: "", label: "所有状态" },
  { value: "passed", label: "调试通过" },
  { value: "pending", label: "待调试" },
  { value: "added", label: "已添加" },
  { value: "not_added", label: "未添加" },
];

type SortKey =
  | "id"
  | "resource"
  | "resource_type"
  | "tier"
  | "drop"
  | "created_at"
  | "updated_at";
type SortOrder = "asc" | "desc";

const DEFAULT_SORT: SortKey = "updated_at";
const DEFAULT_ORDER: SortOrder = "desc";

export function ResourceListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam =
    (searchParams.get("type") as "all" | "mount" | "pet" | "npc") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = 20;

  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") || "",
  );

  const sortKey = (searchParams.get("sort") as SortKey) || DEFAULT_SORT;
  const sortOrder = (searchParams.get("order") as SortOrder) || DEFAULT_ORDER;

  const counts = useQueries({
    queries: TYPES.slice(1).map((t) => ({
      queryKey: ["count", t.key],
      queryFn: () => getResourceCount(t.key),
    })),
  });

  const {
    data: allItems,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["resources-all", typeParam],
    queryFn: () => fetchAllResources(typeParam),
  });

  const filtered = useMemo(() => {
    if (!allItems) return [];
    let items = [...allItems];

    const search = (searchParams.get("search") || "").trim().toLowerCase();
    if (search) {
      items = items.filter(
        (r) =>
          r.model_folder.toLowerCase().includes(search) ||
          (r.official_db.name?.toLowerCase().includes(search) ?? false) ||
          String(r.id).includes(search),
      );
    }

    const category = searchParams.get("category") || "";
    if (category) {
      items = items.filter((r) => {
        if (r.resource_type === "mount") return r.mount_type === category;
        return r.rarity === category;
      });
    }

    const tier = searchParams.get("tier") || "";
    if (tier) {
      items = items.filter((r) => {
        if (r.resource_type === "mount") return r.star_rating === tier;
        return r.rarity === tier;
      });
    }

    const status = searchParams.get("status") || "";
    if (status === "passed") items = items.filter((r) => r.debug_passed);
    if (status === "pending") items = items.filter((r) => !r.debug_passed);
    if (status === "added") items = items.filter((r) => r.added);
    if (status === "not_added") items = items.filter((r) => !r.added);

    return items;
  }, [allItems, searchParams]);

  const sorted = useMemo(() => {
    return sortResources(filtered, sortKey, sortOrder);
  }, [filtered, sortKey, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== "page") next.set("page", "1");
    setSearchParams(next);
  };

  const applySearch = () => updateParam("search", searchInput);

  const setSort = (key: SortKey) => {
    const next = new URLSearchParams(searchParams);
    if (key === sortKey) {
      next.set("order", sortOrder === "asc" ? "desc" : "asc");
    } else {
      next.set("sort", key);
      next.set("order", DEFAULT_ORDER);
    }
    next.set("page", "1");
    setSearchParams(next);
  };

  const countMap: Record<string, number> = {
    mount: counts[0].data ?? 0,
    pet: counts[1].data ?? 0,
    npc: counts[2].data ?? 0,
  };
  countMap.all = countMap.mount + countMap.pet + countMap.npc;

  const categoryOptions = useMemo(() => {
    if (!allItems) return [];
    const set = new Set<string>();
    allItems.forEach((r) => {
      const val = r.resource_type === "mount" ? r.mount_type : r.rarity;
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [allItems]);

  const tierOptions = useMemo(() => {
    if (!allItems) return [];
    const set = new Set<string>();
    allItems.forEach((r) => {
      const val = r.resource_type === "mount" ? r.star_rating : r.rarity;
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [allItems]);

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
            <button
              className="btn btn-sm"
              onClick={() => window.location.reload()}
            >
              刷新
            </button>
            <button className="btn btn-sm" disabled title="导出功能开发中">
              导出当前页
            </button>
          </div>
        </div>

        {isLoading && (
          <p className="px-5 py-8 text-center text-text-secondary">加载中...</p>
        )}
        {error && (
          <p className="px-5 py-8 text-center text-danger">
            加载失败：{error instanceof Error ? error.message : String(error)}
          </p>
        )}

        {!isLoading && !error && (
          <>
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" />
                    </th>
                    <SortHeader
                      label="资源"
                      active={sortKey === "resource"}
                      order={sortOrder}
                      onClick={() => setSort("resource")}
                    />
                    <SortHeader
                      label="ID"
                      active={sortKey === "id"}
                      order={sortOrder}
                      onClick={() => setSort("id")}
                    />
                    <SortHeader
                      label="类型"
                      active={sortKey === "resource_type"}
                      order={sortOrder}
                      onClick={() => setSort("resource_type")}
                    />
                    <SortHeader
                      label="星级/稀有度"
                      active={sortKey === "tier"}
                      order={sortOrder}
                      onClick={() => setSort("tier")}
                    />
                    <SortHeader
                      label="掉落来源"
                      active={sortKey === "drop"}
                      order={sortOrder}
                      onClick={() => setSort("drop")}
                    />
                    <th>状态</th>
                    <SortHeader
                      label="添加时间"
                      active={sortKey === "created_at"}
                      order={sortOrder}
                      onClick={() => setSort("created_at")}
                    />
                    <SortHeader
                      label="修改时间"
                      active={sortKey === "updated_at"}
                      order={sortOrder}
                      onClick={() => setSort("updated_at")}
                    />
                    <th style={{ textAlign: "right" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((resource) => (
                    <tr key={`${resource.resource_type}-${resource.id}`}>
                      <td>
                        <input type="checkbox" />
                      </td>
                      <td>
                        <Link
                          to={`/resources/${resource.resource_type}/${resource.id}`}
                          className="name-cell"
                          title={resource.name || resource.model_folder}
                        >
                          <ResourceThumb resource={resource} />
                          <div className="min-w-0">
                            <div className="resource-name truncate">
                              {resource.name || resource.model_folder}
                            </div>
                            <div className="resource-meta truncate">
                              id: {String(resource.id).padStart(4, "0")} ·{" "}
                              {resource.model_folder}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td>{String(resource.id).padStart(4, "0")}</td>
                      <td>
                        <TypeBadge resource={resource} />
                      </td>
                      <td>{resource.star_rating || resource.rarity || "—"}</td>
                      <td>{formatDrop(resource.drop)}</td>
                      <td>
                        <StatusBadge resource={resource} />
                      </td>
                      <td className="text-text-secondary">
                        {formatDateTime(resource.created_at)}
                      </td>
                      <td className="text-text-secondary">
                        {formatDateTime(resource.updated_at)}
                      </td>
                      <td className="text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <Link
                            to={`/resources/${resource.resource_type}/${resource.id}`}
                            className="btn btn-sm"
                            title="编辑资源"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">编辑</span>
                          </Link>
                          <Link
                            to={`/preview/${resource.resource_type}/${resource.id}`}
                            className="btn btn-sm btn-primary"
                            title="预览模型"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">预览</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {currentItems.length === 0 && (
                    <tr>
                      <td colSpan={10}>
                        <div className="empty-state">
                          <Search className="mb-3 h-12 w-12 text-text-tertiary" />
                          <h3>暂无资源</h3>
                          <p>
                            当前筛选条件下没有找到资源，请尝试调整搜索或筛选条件。
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <div>
                显示 {sorted.length > 0 ? (page - 1) * pageSize + 1 : 0}-
                {Math.min(page * pageSize, sorted.length)} 条，共{" "}
                {sorted.length} 条
              </div>
              <div className="page-nav">
                <button
                  className="page-btn"
                  disabled={page <= 1}
                  onClick={() => updateParam("page", String(page - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {pageButtons(totalPages, page).map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="flex h-8 items-center px-1 text-text-tertiary"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={cn("page-btn", page === p && "active")}
                      onClick={() => updateParam("page", String(p))}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  className="page-btn"
                  disabled={page >= totalPages}
                  onClick={() => updateParam("page", String(page + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: SortOrder;
  onClick: () => void;
}) {
  const Icon = active ? (order === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      onClick={onClick}
      className="cursor-pointer select-none whitespace-nowrap"
      title="点击排序"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className="h-3.5 w-3.5 text-text-tertiary" />
      </span>
    </th>
  );
}

function TypeBadge({ resource }: { resource: Resource }) {
  const config: Record<string, { label: string; className: string }> = {
    mount: { label: resource.mount_type || "坐骑", className: "badge-blue" },
    pet: { label: "宠物", className: "badge-orange" },
    npc: { label: "NPC", className: "badge-green" },
  };
  const { label, className } = config[resource.resource_type] || {
    label: resource.resource_type,
    className: "badge-gray",
  };
  return (
    <span className={cn("badge", className)} title={label}>
      {label}
    </span>
  );
}

function StatusBadge({ resource }: { resource: Resource }) {
  const addedText = resource.added ? "已通过 · 已添加" : "已通过 · 未添加";
  const pendingText = resource.added ? "待调试 · 已添加" : "待调试 · 未添加";
  if (resource.debug_passed) {
    return (
      <span className="badge badge-success" title={addedText}>
        <span className="status-dot bg-success" />
        已通过
      </span>
    );
  }
  return (
    <span className="badge badge-warning" title={pendingText}>
      <span className="status-dot bg-warning" />
      待调试
    </span>
  );
}

function formatDrop(drop: Resource["drop"]) {
  const parts: string[] = [];
  if (drop.instance) parts.push(drop.instance);
  if (drop.boss) parts.push(drop.boss);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sortResources(
  items: Resource[],
  key: SortKey,
  order: SortOrder,
): Resource[] {
  const sorted = [...items].sort((a, b) => {
    let comparison = 0;
    switch (key) {
      case "id":
        comparison = a.id - b.id;
        break;
      case "resource":
        comparison = (a.name || a.model_folder).localeCompare(
          b.name || b.model_folder,
        );
        break;
      case "resource_type":
        comparison = a.resource_type.localeCompare(b.resource_type);
        break;
      case "tier":
        comparison = (a.star_rating || a.rarity || "").localeCompare(
          b.star_rating || b.rarity || "",
        );
        break;
      case "drop":
        comparison = formatDrop(a.drop).localeCompare(formatDrop(b.drop));
        break;
      case "created_at":
        comparison =
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime();
        break;
      case "updated_at":
        comparison =
          new Date(a.updated_at || 0).getTime() -
          new Date(b.updated_at || 0).getTime();
        break;
    }
    return comparison;
  });
  return order === "asc" ? sorted : sorted.reverse();
}

function pageButtons(total: number, current: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, "...", total];
  if (current >= total - 2)
    return [1, "...", total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}
