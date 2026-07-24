import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { listResources } from "@/shared/resources";
import type { Resource } from "@/shared/types";

export function useRecentResources() {
  const results = useQueries({
    queries: [
      {
        queryKey: ["recent", "mount"],
        queryFn: () =>
          listResources("mount", {
            page_size: 5,
            sort_by: "updated_at",
            sort_order: "desc",
          }),
      },
      {
        queryKey: ["recent", "pet"],
        queryFn: () =>
          listResources("pet", {
            page_size: 5,
            sort_by: "updated_at",
            sort_order: "desc",
          }),
      },
      {
        queryKey: ["recent", "npc"],
        queryFn: () =>
          listResources("npc", {
            page_size: 5,
            sort_by: "updated_at",
            sort_order: "desc",
          }),
      },
    ],
  });

  return useMemo(() => {
    const all: Resource[] = [];
    for (const res of results) {
      if (res.data) all.push(...res.data.items);
    }
    return all
      .sort(
        (a, b) =>
          new Date(b.updated_at ?? 0).getTime() -
          new Date(a.updated_at ?? 0).getTime(),
      )
      .slice(0, 5);
  }, [results]);
}
