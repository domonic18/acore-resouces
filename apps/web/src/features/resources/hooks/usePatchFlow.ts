import { useQuery } from "@tanstack/react-query";
import {
  getBatchValidationReport,
  getJobArtifacts,
  getJobValidationReport,
  getPatchPreview,
  getResourceFlow,
  getResourceRelationships,
} from "@/shared/patches";

/** 坐骑补丁预览（所见即所得） */
export function usePatchPreview(resourceId: number | null, enabled = true) {
  return useQuery({
    queryKey: ["patch-preview", resourceId],
    queryFn: () => getPatchPreview("mount", resourceId as number),
    enabled: enabled && resourceId !== null,
    staleTime: 30_000,
  });
}

/** 资源的跨数据源关联校验结果 */
export function useResourceRelationships(
  resourceType: string,
  resourceId: number | null,
) {
  return useQuery({
    queryKey: ["resource-relationships", resourceType, resourceId],
    queryFn: () => getResourceRelationships(resourceType, resourceId as number),
    enabled: resourceId !== null,
    staleTime: 30_000,
  });
}

/** 资源在生产流程中的位置与各步状态 */
export function useResourceFlow(
  resourceType: string,
  resourceId: number | null,
) {
  return useQuery({
    queryKey: ["resource-flow", resourceType, resourceId],
    queryFn: () => getResourceFlow(resourceType, resourceId as number),
    enabled: resourceId !== null,
  });
}

/** 单个任务的校验报告切片 */
export function useJobValidationReport(jobId: string | null) {
  return useQuery({
    queryKey: ["job-validation-report", jobId],
    queryFn: () => getJobValidationReport(jobId as string),
    enabled: Boolean(jobId),
  });
}

/** 批次的完整校验报告 */
export function useBatchValidationReport(batch: string | null) {
  return useQuery({
    queryKey: ["batch-validation-report", batch],
    queryFn: () => getBatchValidationReport(batch as string),
    enabled: Boolean(batch),
  });
}

/** 单个任务的产物清单 */
export function useJobArtifacts(jobId: string | null) {
  return useQuery({
    queryKey: ["job-artifacts", jobId],
    queryFn: () => getJobArtifacts(jobId as string),
    enabled: Boolean(jobId),
  });
}
