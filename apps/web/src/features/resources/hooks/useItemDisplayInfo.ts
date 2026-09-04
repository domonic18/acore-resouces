import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getItemDisplayInfo, searchItemDisplayInfo } from "@/shared/resources";

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** 服务端搜索 ItemDisplayInfo.dbc（数字按 ID、文字按图标名，300ms 防抖） */
export function useItemDisplayInfoSearch(search: string) {
  const debouncedSearch = useDebouncedValue(search.trim());
  return useQuery({
    queryKey: ["dbc", "item-display-info", debouncedSearch],
    queryFn: () => searchItemDisplayInfo({ search: debouncedSearch, limit: 120 }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
}

/** 按记录 ID 查单条（用于当前值图标预览）；0/null 不查询，404 视为未收录 */
export function useItemDisplayInfo(id: number | null) {
  return useQuery({
    queryKey: ["dbc", "item-display-info-item", id],
    queryFn: () => getItemDisplayInfo(id as number),
    enabled: id !== null && id > 0,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
