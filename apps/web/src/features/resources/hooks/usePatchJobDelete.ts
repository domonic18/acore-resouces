import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePatchJob } from "@/shared/patches";

export function usePatchJobDelete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => deletePatchJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patch-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["patch-batches"] });
    },
  });
}
