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
      {
        queryKey: ["stats", "mount", "pending"],
        queryFn: () => listResources("mount", { page_size: 1, debug_passed: false }),
      },
      {
        queryKey: ["stats", "pet", "pending"],
        queryFn: () => listResources("pet", { page_size: 1, debug_passed: false }),
      },
      {
        queryKey: ["stats", "npc", "pending"],
        queryFn: () => listResources("npc", { page_size: 1, debug_passed: false }),
      },
    ],
  });

  const [mountRes, petRes, npcRes, mountPending, petPending, npcPending] =
    results;
  return {
    isLoading: results.some((r) => r.isLoading),
    data: {
      mount: mountRes.data?.total ?? 0,
      pet: petRes.data?.total ?? 0,
      npc: npcRes.data?.total ?? 0,
      pending:
        (mountPending.data?.total ?? 0) +
        (petPending.data?.total ?? 0) +
        (npcPending.data?.total ?? 0),
    },
  };
}
