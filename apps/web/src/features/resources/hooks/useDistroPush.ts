import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDistroBatch,
  getDistroAdminBatches,
  getDistroStatus,
  pushToDistro,
  updateDistroBatchMeta,
} from "@/shared/patches";

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

/** 分发端全部批次（含 pending 与失败残留） */
export function useDistroAdminBatches() {
  return useQuery({
    queryKey: ["distro-admin-batches"],
    queryFn: getDistroAdminBatches,
    staleTime: 30_000,
    retry: false,
  });
}

/** 从分发端删除批次——玩家将不再能下载该补丁 */
export function useDistroBatchDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batch: string) => deleteDistroBatch(batch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["distro-status"] });
      queryClient.invalidateQueries({ queryKey: ["distro-admin-batches"] });
    },
  });
}

/** 修改分发端批次的元数据（如 changelog） */
export function useDistroBatchMetaUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      batch: string;
      changelog?: string;
      mount_count?: number;
      file_count?: number;
    }) => updateDistroBatchMeta(input.batch, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["distro-status"] });
      queryClient.invalidateQueries({ queryKey: ["distro-admin-batches"] });
    },
  });
}
