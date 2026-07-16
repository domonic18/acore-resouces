import { useQueries } from "@tanstack/react-query";
import { listResources } from "@/shared/resources";

export function useResourceStats() {
  const results = useQueries({
    queries: [
      {
        queryKey: ["stats", "mount"],
        queryFn: () => listResources("mount", { page_size: 1 }),
      },
      {
        queryKey: ["stats", "pet"],
        queryFn: () => listResources("pet", { page_size: 1 }),
      },
      {
        queryKey: ["stats", "npc"],
        queryFn: () => listResources("npc", { page_size: 1 }),
      },
    ],
  });

  const [mountRes, petRes, npcRes] = results;
  return {
    isLoading: results.some((r) => r.isLoading),
    data: {
      mount: mountRes.data?.total ?? 0,
      pet: petRes.data?.total ?? 0,
      npc: npcRes.data?.total ?? 0,
      pending:
        (mountRes.data?.items.filter((r) => !r.debug_passed).length ?? 0) +
        (petRes.data?.items.filter((r) => !r.debug_passed).length ?? 0) +
        (npcRes.data?.items.filter((r) => !r.debug_passed).length ?? 0),
    },
  };
}
