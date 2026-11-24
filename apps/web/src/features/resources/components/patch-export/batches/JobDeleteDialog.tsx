import { usePatchJobDelete } from "@/features/resources/hooks/usePatchJobDelete";
import { Dialog } from "@/shared/components/ui/Dialog";
import type { PatchBatchJob } from "@/shared/types";

interface JobDeleteDialogProps {
  job: PatchBatchJob;
  onClose: () => void;
  mutation: ReturnType<typeof usePatchJobDelete>;
}

/** 删除单个补丁任务确认框 */
export function JobDeleteDialog({ job, onClose, mutation }: JobDeleteDialogProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="确认删除任务"
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
              mutation.mutate(job.job_id, {
                onSuccess: onClose,
              })
            }
          >
            {mutation.isPending ? "删除中..." : "确认删除"}
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        将删除{" "}
        <span className="font-mono text-xs">{job.job_id}</span>（
        {job.resource_name}）。仅移除任务目录，不影响真相源与已生成产物。
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
