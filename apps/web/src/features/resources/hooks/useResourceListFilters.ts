import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DEFAULT_SORT,
  DEFAULT_ORDER,
  sortResources,
  pageButtons,
} from "../lib/resource-list";
import type { Resource } from "@/shared/types";
import type { SortKey, SortOrder } from "../lib/resource-list";

const PAGE_SIZE = 20;

export function useResourceListFilters(allItems: Resource[] | undefined) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const [searchInput, setSearchInput] = useState(
    searchParams.get("search") || "",
  );

  const sortKey = (searchParams.get("sort") as SortKey) || DEFAULT_SORT;
  const sortOrder = (searchParams.get("order") as SortOrder) || DEFAULT_ORDER;

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
      items = items.filter(
        (r) => r.resource_type === "mount" && r.mount_type === category,
      );
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

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
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

  const categoryOptions = useMemo(() => {
    if (!allItems) return [];
    const set = new Set<string>();
    allItems.forEach((r) => {
      if (r.resource_type === "mount" && r.mount_type) set.add(r.mount_type);
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

  return {
    searchParams,
    searchInput,
    setSearchInput,
    applySearch,
    sortKey,
    sortOrder,
    setSort,
    filtered,
    sorted,
    currentItems,
    totalPages,
    page,
    pageButtons: pageButtons(totalPages, page),
    updateParam,
    categoryOptions,
    tierOptions,
  };
}
