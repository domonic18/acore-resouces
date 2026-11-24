import { Dialog } from "@/shared/components/ui/Dialog";
import type { PatchBatch } from "@/shared/types";

interface BatchRebuildDialogProps {
  batch: PatchBatch;
  /** 确认后把该批任务带入左侧向导的构建步骤 */
  onConfirm: (jobIds: string[]) => void;
  onClose: () => void;
}

/** 重建批次：确认框——把该批任务汇入向导，构建 / 审查 / 发布都在向导里继续。 */
export function BatchRebuildDialog({
  batch,
  onConfirm,
  onClose,
}: BatchRebuildDialogProps) {
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
            disabled={jobIds.length === 0}
            onClick={() => {
              onConfirm(jobIds);
              onClose();
            }}
          >
            带入向导构建
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        确认后这 {batch.job_count} 只坐骑的任务会带入左侧「制作补丁包」向导并跳到构建步骤，构建日志、产物审查与发布都在向导里完成。
      </p>
      <p className="mt-2 text-xs text-text-tertiary">
        构建默认先试运行（不改任何文件），只处理这一批任务，不影响其它待处理任务。
      </p>
    </Dialog>
  );
}
