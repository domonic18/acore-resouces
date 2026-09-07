import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cleanWorkspace, type WorkspaceCleanRequest } from "@/shared/patches";

export function useWorkspaceClean() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: WorkspaceCleanRequest) => cleanWorkspace(body),
    onSuccess: (result) => {
      if (!result.dry_run) {
        queryClient.invalidateQueries({ queryKey: ["patch-jobs"] });
      }
    },
  });
}
