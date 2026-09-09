import { useQuery } from "@tanstack/react-query";
import { listPatchBatches } from "@/shared/patches";

export function usePatchBatches(status: string | undefined, building: boolean) {
  return useQuery({
    queryKey: ["patch-batches", { status }],
    queryFn: () => listPatchBatches({ status }),
    refetchInterval: building ? 2000 : false,
  });
}
