import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DEFAULT_SORT,
  DEFAULT_ORDER,
  sortResources,
  pageButtons,
  computeResourceTags,
  matchesStatusFilter,
  matchesTagFilter,
  matchesUpdatedAtFilter,
} from "../lib/resource-list";
import type { Resource } from "@/shared/types";
import type {
  SortKey,
  SortOrder,
  StatusTagValue,
  ResourceTagValue,
} from "../lib/resource-list";

function parseParamList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildParamList(values: string[]): string {
  return values.join(",");
}

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

    const statuses = parseParamList(
      searchParams.get("status"),
    ) as StatusTagValue[];
    if (statuses.length > 0) {
      items = items.filter((r) => matchesStatusFilter(r, statuses));
    }

    const tags = parseParamList(searchParams.get("tags")) as ResourceTagValue[];
    if (tags.length > 0) {
      items = items.filter((r) => matchesTagFilter(r, tags));
    }

    const updatedStart = searchParams.get("updated_start");
    const updatedEnd = searchParams.get("updated_end");
    if (updatedStart || updatedEnd) {
      items = items.filter((r) =>
        matchesUpdatedAtFilter(r, updatedStart, updatedEnd),
      );
    }

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

  const toggleParamValue = (key: "status" | "tags", value: string) => {
    const current = parseParamList(searchParams.get(key));
    const nextValues = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateParam(key, buildParamList(nextValues));
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

  const tagOptions = useMemo(() => {
    if (!allItems) return [];
    const set = new Set<ResourceTagValue>();
    allItems.forEach((r) => {
      computeResourceTags(r).forEach((t) => set.add(t));
    });
    return Array.from(set);
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
    toggleParamValue,
    categoryOptions,
    tierOptions,
    tagOptions,
  };
}
