import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchAllResources, getResourceCount } from "@/shared/resources";
import { TYPES } from "../lib/resource-list";

export function useResourceListData(
  typeParam: "all" | "mount" | "pet" | "npc",
) {
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

  const countMap: Record<string, number> = {
    mount: counts[0].data ?? 0,
    pet: counts[1].data ?? 0,
    npc: counts[2].data ?? 0,
  };
  countMap.all = countMap.mount + countMap.pet + countMap.npc;

  return { allItems, isLoading, error, countMap };
}
