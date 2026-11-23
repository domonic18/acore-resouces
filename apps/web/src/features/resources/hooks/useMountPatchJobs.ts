import { useQuery } from "@tanstack/react-query";
import { listPatchJobs } from "@/shared/patches";
import type { PatchJob } from "@/shared/types";

const PAGE_SIZE = 100;

/**
 * 全部坐骑补丁任务，按资源 ID 建索引。
 *
 * 资源列表页用它显示每只坐骑在补丁流水线上的位置——
 * 让入口页本身成为流程状态总览，而不是只显示「调试通过 / 已添加」。
 * enabled=false 时（无权限查看补丁任务）不发请求，避免 403 噪音。
 */
export function useMountPatchJobs(enabled = true) {
  return useQuery({
    queryKey: ["mount-patch-jobs"],
    queryFn: async () => {
      const first = await listPatchJobs({ page: 1, page_size: PAGE_SIZE });
      const pageCount = Math.ceil(first.total / PAGE_SIZE);
      const rest = await Promise.all(
        Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) =>
          listPatchJobs({ page: index + 2, page_size: PAGE_SIZE }),
        ),
      );
      return [first, ...rest].flatMap((page) => page.items);
    },
    staleTime: 10_000,
    enabled,
  });
}

/** 把补丁任务列表转成「资源 ID → 任务」的映射 */
export function toJobMap(jobs: PatchJob[]): Map<number, PatchJob> {
  const map = new Map<number, PatchJob>();
  for (const job of jobs) {
    if (job.resource_type === "mount") {
      map.set(job.resource_id, job);
    }
  }
  return map;
}
