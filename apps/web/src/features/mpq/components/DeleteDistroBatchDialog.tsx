import { AlertTriangle, Trash2 } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Dialog } from "@/shared/components/ui/Dialog";
import { formatBytes } from "@/features/dbc/lib/columns";
import type { DistroAdminBatchInfo, DistroDeleteResult } from "@/shared/types";

interface DeleteDistroBatchDialogProps {
  batch: DistroAdminBatchInfo;
  /** 本地是否还留有该批次的副本 */
  hasLocalCopy: boolean;
  mutation: UseMutationResult<DistroDeleteResult, Error, string>;
  onClose: () => void;
}

/**
 * 从分发端删除批次的确认对话框。
 *
 * 删除后玩家就无法再下载这个补丁了——但已经下载到本地的客户端不受影响，
 * 补丁文件本身也从分发端磁盘上消失，因此这一步不可逆。
 */
export function DeleteDistroBatchDialog({
  batch,
  hasLocalCopy,
  mutation,
  onClose,
}: DeleteDistroBatchDialogProps) {
  const pending = batch.status !== "complete";

  return (
    <Dialog
      open
      onClose={onClose}
      title="从分发端删除补丁"
      subtitle={`批次 ${batch.batch}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(batch.batch, { onSuccess: onClose })
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
            {mutation.isPending ? "删除中..." : "确认删除"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-border bg-bg-surface px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-text-primary">
              {batch.patch_file ?? "（无补丁文件）"}
            </span>
            <span className="shrink-0 text-text-tertiary">
              补丁 #{batch.patch_number ?? "?"}
            </span>
          </div>
          <div className="mt-1 text-text-tertiary">
            批次 {batch.batch}
            {batch.mpq_bytes ? ` · ${formatBytes(batch.mpq_bytes)}` : ""}
            {batch.mount_count ? ` · ${batch.mount_count} 只坐骑` : ""}
          </div>
        </div>

        <div className="flex gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            删除后玩家将<b>无法再下载</b>该补丁，补丁文件也会从分发端磁盘移除。
            已经下载到本地的客户端不受影响。这一步<b>不可撤销</b>。
          </span>
        </div>

        {pending && (
          <div className="rounded-md border border-border bg-bg-surface px-3 py-2 text-xs text-text-secondary">
            该批次当前状态为 <b>{batch.status}</b>，玩家本就看不到它，
            删除只是清理残留。
          </div>
        )}

        {hasLocalCopy && (
          <div className="rounded-md border border-border bg-bg-surface px-3 py-2 text-xs text-text-secondary">
            本地还留有该批次的副本，删除分发端不影响它；
            需要一并清理请到「MPQ 档案」里删除本地文件。
          </div>
        )}

        {mutation.data && !mutation.data.error && (
          <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            已从分发端删除
            {mutation.data.freed_bytes
              ? `，释放 ${formatBytes(mutation.data.freed_bytes)}`
              : ""}
            。
          </div>
        )}

        {mutation.data?.error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            删除失败：{mutation.data.error}
          </div>
        )}

        {mutation.isError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            删除失败：
            {mutation.error instanceof Error
              ? mutation.error.message
              : "未知错误"}
          </div>
        )}
      </div>
    </Dialog>
  );
}
