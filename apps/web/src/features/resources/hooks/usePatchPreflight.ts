import { useQuery } from "@tanstack/react-query";
import { previewPatchBatch } from "@/shared/patches";
import type { MountPatchPreview } from "@/shared/types";

export interface PreflightSummary {
  resourceId: number;
  ready: boolean;
  errorCount: number;
  warningCount: number;
  /** 第一个错误/警告的说明 */
  headline: string | null;
  /** 未填写的必填字段名 */
  missingFields: string[];
}

/**
 * 批量预检结果。
 *
 * 创建补丁任务前用它告诉用户「这几只坐骑能不能做、缺什么」，
 * 避免建完任务才发现构建会失败。
 */
export function usePatchPreflight(
  resourceIds: number[],
  enabled: boolean,
  resourceType = "mount",
) {
  return useQuery({
    queryKey: ["patch-preflight", resourceType, resourceIds],
    queryFn: async () => {
      const previews = await previewPatchBatch(resourceIds, resourceType);
      const map = new Map<number, PreflightSummary>();
      for (const preview of previews) {
        map.set(preview.resource_id, summarize(preview));
      }
      return map;
    },
    enabled: enabled && resourceIds.length > 0,
    staleTime: 30_000,
  });
}

function summarize(preview: MountPatchPreview): PreflightSummary {
  const errors = preview.issues.filter((issue) => issue.severity === "error");
  const warnings = preview.issues.filter((issue) => issue.severity === "warning");
  const firstError = errors[0];
  return {
    resourceId: preview.resource_id,
    ready: preview.ready,
    errorCount: errors.length,
    warningCount: warnings.length,
    headline: firstError?.message ?? null,
    missingFields: (preview.required_fields?.missing ?? []).map(
      (field) => field.label,
    ),
  };
}
