import { useState } from "react";
import { useBatchBuild } from "@/features/resources/hooks/usePatchBatchActions";
import { Dialog } from "@/shared/components/ui/Dialog";
import type { PatchBatch } from "@/shared/types";

interface BatchRebuildDialogProps {
  batch: PatchBatch;
  onClose: () => void;
}

/** 重建批次：试运行 / 正式构建 */
export function BatchRebuildDialog({ batch, onClose }: BatchRebuildDialogProps) {
  const [dryRun, setDryRun] = useState(true);
  const build = useBatchBuild();
  const jobIds = batch.jobs.map((job) => job.job_id);

  return (
    <Dialog
      open
      onClose={onClose}
      title="重建批次"
      subtitle={`批次 ${batch.batch_id} · ${batch.job_count} 只坐骑`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={build.isPending || jobIds.length === 0}
            onClick={() =>
              build.mutate(
                { jobIds, dryRun },
                { onSuccess: onClose },
              )
            }
          >
            {build.isPending ? "启动中..." : dryRun ? "开始试运行" : "开始构建"}
          </button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            checked={dryRun}
            onChange={() => setDryRun(true)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
          />
          <span>
            <span className="text-text-primary">先试运行</span>
            <span className="ml-2 text-xs text-text-tertiary">
              只检查 ID 冲突并生成计划，不修改任何文件
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            checked={!dryRun}
            onChange={() => setDryRun(false)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-500"
          />
          <span>
            <span className="text-danger">正式构建</span>
            <span className="ml-2 text-xs text-text-tertiary">
              会改写源 DBC 记录并生成 SQL 补丁
            </span>
          </span>
        </label>
      </div>
      {dryRun && (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          试运行不产出校验报告与补丁包，所以构建完仍然无法「审查产物」。
          想让流程继续往下走，请改选「正式构建」。
        </div>
      )}
      <p className="mt-3 text-xs text-text-tertiary">
        构建只处理这 {batch.job_count} 只坐骑，不影响其它待处理任务。
      </p>
      {build.isError && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {build.error instanceof Error ? build.error.message : "启动构建失败"}
        </div>
      )}
    </Dialog>
  );
}
