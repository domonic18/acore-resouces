import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchAllResources, getResourceCount } from "@/shared/resources";
import { TYPES } from "../lib/resource-list";

const ALL_TYPES = TYPES.slice(1).map((t) => t.key);

export function useResourceListData(
  typeParam: "all" | "mount" | "pet" | "npc",
  /** 允许发起计数查询的资源类型（无权限的类型不发请求，避免 403 噪音） */
  allowedTypes: string[] = ALL_TYPES,
) {
  const allowed = new Set(allowedTypes);
  const counts = useQueries({
    queries: ALL_TYPES.map((key) => ({
      queryKey: ["count", key],
      queryFn: () => getResourceCount(key),
      enabled: allowed.has(key),
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

  const countMap: Record<string, number> = {
    mount: allowed.has("mount") ? (counts[0].data ?? 0) : 0,
    pet: allowed.has("pet") ? (counts[1].data ?? 0) : 0,
    npc: allowed.has("npc") ? (counts[2].data ?? 0) : 0,
  };
  countMap.all = countMap.mount + countMap.pet + countMap.npc;

  return { allItems, isLoading, error, countMap };
}
