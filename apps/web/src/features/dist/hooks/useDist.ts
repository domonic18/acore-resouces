import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteDistBatch, getDistChangelog, getDistTree } from "@/shared/dist";

/** 玩家下载树（发布即上架，无轮询需求） */
export function useDistTree() {
  return useQuery({
    queryKey: ["dist", "tree"],
    queryFn: getDistTree,
    staleTime: 15_000,
  });
}

/** 批次玩家公告（Markdown） */
export function useDistChangelog(batch: string | null) {
  return useQuery({
    queryKey: ["dist", "changelog", batch],
    queryFn: () => getDistChangelog(batch as string),
    enabled: !!batch,
    retry: false,
  });
}

/** admin：下线批次（删除 dist 下整个批次目录） */
export function useDistBatchDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batch: string) => deleteDistBatch(batch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dist", "tree"] });
      queryClient.invalidateQueries({ queryKey: ["dist", "admin-batches"] });
    },
  });
}
