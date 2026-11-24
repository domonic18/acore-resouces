import { useQuery } from "@tanstack/react-query";
import { compareBatches } from "@/shared/patches";

export function useBatchCompare(
  batchId: string | null,
  againstBatchId: string | null,
) {
  return useQuery({
    queryKey: ["patch-batch-compare", batchId, againstBatchId],
    queryFn: () => compareBatches(batchId as string, againstBatchId as string),
    enabled: Boolean(batchId && againstBatchId && batchId !== againstBatchId),
    retry: false,
  });
}
