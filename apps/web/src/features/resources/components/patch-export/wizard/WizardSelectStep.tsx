import { Loader2, PackagePlus } from "lucide-react";
import { MountMultiSelect } from "@/features/resources/components/patch-export/MountMultiSelect";
import type { WizardSelectStepProps } from "./types";

/** 向导第 0 步（全流程第 ⑥ 步）：选择坐骑并创建补丁任务。 */
export function WizardSelectStep({
  selectedIds,
  onSelectedIdsChange,
  canWrite,
  exportMutation,
  onCreateJobs,
}: WizardSelectStepProps) {
  return (
    <div className="space-y-4">
      <MountMultiSelect selected={selectedIds} onChange={onSelectedIdsChange} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={
            !canWrite || selectedIds.length === 0 || exportMutation.isPending
          }
          title={canWrite ? undefined : "仅管理员可创建补丁任务"}
          onClick={onCreateJobs}
        >
          {exportMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> 创建中...
            </>
          ) : (
            <>
              <PackagePlus className="h-4 w-4" />
              创建补丁任务 ({selectedIds.length})
            </>
          )}
        </button>
        <span className="text-xs text-text-tertiary">
          创建后进入构建步骤；本次任务范围会带入构建，不会波及其它待处理任务。
        </span>
      </div>
      <p className="text-xs text-text-tertiary">
        已有历史批次？到右侧「已有批次」列表对目标批次点「重建」，会直接带入构建步骤。
      </p>
      {exportMutation.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {exportMutation.error instanceof Error
            ? exportMutation.error.message
            : "创建补丁任务失败"}
        </div>
      )}
    </div>
  );
}
