import { useBatchDelete } from "@/features/resources/hooks/usePatchBatchActions";
import { Dialog } from "@/shared/components/ui/Dialog";
import type { PatchBatch } from "@/shared/types";

interface BatchDeleteDialogProps {
  batch: PatchBatch;
  onClose: () => void;
  mutation: ReturnType<typeof useBatchDelete>;
}

/** 删除整个批次确认框 */
export function BatchDeleteDialog({
  batch,
  onClose,
  mutation,
}: BatchDeleteDialogProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="确认删除批次"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(batch.batch_id, { onSuccess: onClose })
            }
          >
            {mutation.isPending ? "删除中..." : "确认删除"}
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        将删除批次{" "}
        <span className="font-mono text-xs">{batch.batch_id}</span> 下的{" "}
        {batch.job_count} 个补丁任务。仅移除任务目录，不影响真相源与已生成的
        DBC / SQL / MPQ 产物。
      </p>
      {mutation.isError && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "删除失败"}
        </div>
      )}
    </Dialog>
  );
}
