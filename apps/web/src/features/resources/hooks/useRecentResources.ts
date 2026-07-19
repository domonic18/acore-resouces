import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { listResources } from "@/shared/resources";
import type { Resource } from "@/shared/types";

export function useRecentResources() {
  const results = useQueries({
    queries: [
      {
        queryKey: ["recent", "mount"],
        queryFn: () => listResources("mount", { page_size: 5 }),
      },
      {
        queryKey: ["recent", "pet"],
        queryFn: () => listResources("pet", { page_size: 5 }),
      },
      {
        queryKey: ["recent", "npc"],
        queryFn: () => listResources("npc", { page_size: 5 }),
      },
    ],
  });

  return useMemo(() => {
    const all: Resource[] = [];
    for (const res of results) {
      if (res.data) all.push(...res.data.items);
    }
    return all.sort((a, b) => b.id - a.id).slice(0, 5);
  }, [results]);
}
