import { AlertTriangle, Trash2 } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Dialog } from "@/shared/components/ui/Dialog";
import { formatBytes } from "@/features/dbc/lib/columns";
import type { MpqArchiveItem } from "@/shared/types";

export interface MpqArchiveDeleteResult {
  deleted: string;
  batch: string;
  source: string;
  size_bytes: number;
  reset_jobs: string[];
}

interface DeleteArchiveDialogProps {
  archive: MpqArchiveItem;
  mutation: UseMutationResult<MpqArchiveDeleteResult, Error, string>;
  onClose: () => void;
}

/**
 * 删除 MPQ 档案的确认对话框。
 *
 * 删除是不可逆的，必须把「会删什么」「会不会影响玩家」讲清楚——
 * 已发布（上架）的补丁删除后玩家立即下载不到，所以每次都提示。
 */
export function DeleteArchiveDialog({
  archive,
  mutation,
  onClose,
}: DeleteArchiveDialogProps) {
  const handleConfirm = async () => {
    try {
      await mutation.mutateAsync(archive.rel_path);
      onClose();
    } catch {
      // 失败信息由 mutation 状态展示在对话框里
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="删除补丁档案"
      subtitle={`批次 ${archive.batch}`}
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
            onClick={handleConfirm}
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
              {archive.name}
            </span>
            <span className="shrink-0 text-text-tertiary">
              {formatBytes(archive.size)}
            </span>
          </div>
          <div className="mt-1 text-text-tertiary">{archive.rel_path}</div>
        </div>

        <div className="text-xs text-text-secondary">
          将删除该补丁文件本体（{formatBytes(archive.size)}）。同批次的
          manifest.json、changelog.md、readme.txt
          <b>保留</b>供审计；资源定义（YAML）与源 DBC{" "}
          <b>不受影响</b>，重新构建即可再生成。
        </div>

        {archive.published && (
          <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              该批次<b>已发布上架</b>，玩家当前可下载。删除后立即下线
              「补丁下载」页中的对应条目（不可撤销）。
            </span>
          </div>
        )}

        {mutation.data && mutation.data.reset_jobs.length > 0 && (
          <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
            引用该批次的 {mutation.data.reset_jobs.length} 个补丁任务已退回
            「待构建」，产物登记同步清空。
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
