import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestPatchExport } from "@/shared/patches";

export function usePatchExport() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      resourceType,
      resourceIds,
    }: {
      resourceType: string;
      resourceIds: number[];
    }) => requestPatchExport(resourceType, resourceIds),
    onSuccess: (_, variables) => {
      for (const resourceId of variables.resourceIds) {
        queryClient.invalidateQueries({
          queryKey: ["patch-jobs", variables.resourceType, resourceId],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["patch-jobs"] });
    },
  });

  return mutation;
}
