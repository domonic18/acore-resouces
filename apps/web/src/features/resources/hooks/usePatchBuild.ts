import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildPatches,
  getBuildStatus,
  type PatchBuildRequest,
} from "@/shared/patches";

export function useBuildStatus() {
  return useQuery({
    queryKey: ["build-status"],
    queryFn: getBuildStatus,
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  });
}

export function usePatchBuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: PatchBuildRequest) => buildPatches(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["build-status"] });
      queryClient.invalidateQueries({ queryKey: ["patch-jobs"] });
    },
  });
}
