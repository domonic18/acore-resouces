import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDistroStatus, pushToDistro } from "@/shared/patches";

/** 推送到分发端（与本地发布是两个独立动作） */
export function useDistroPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { batch_ids?: string[]; dry_run?: boolean }) =>
      pushToDistro(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["distro-status"] });
    },
  });
}

/** 本地已发布批次与分发端已推送批次的对照 */
export function useDistroStatus() {
  return useQuery({
    queryKey: ["distro-status"],
    queryFn: getDistroStatus,
    staleTime: 30_000,
    retry: false,
  });
}
