import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePatchBatch, publishPatches } from "@/shared/patches";

/** 发布指定批次 */
export function useBatchPublish() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      batchIds,
      startNumber,
      dryRun,
    }: {
      batchIds: string[];
      startNumber?: number;
      dryRun?: boolean;
    }) =>
      publishPatches({
        batch_ids: batchIds,
        start_number: startNumber,
        dry_run: dryRun,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patch-batches"] });
      queryClient.invalidateQueries({ queryKey: ["patch-jobs"] });
    },
  });
}

/** 删除一个批次下的全部任务 */
export function useBatchDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => deletePatchBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patch-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["patch-batches"] });
    },
  });
}
