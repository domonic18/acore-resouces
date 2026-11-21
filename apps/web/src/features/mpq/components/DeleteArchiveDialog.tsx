import { AlertTriangle, Trash2 } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Dialog } from "@/shared/components/ui/Dialog";
import { formatBytes } from "@/features/dbc/lib/columns";
import type { DistroDeleteResult, MpqArchiveItem } from "@/shared/types";

export interface MpqArchiveDeleteResult {
  deleted: string;
  batch: string;
  source: string;
  size_bytes: number;
  reset_jobs: string[];
}

interface DeleteArchiveDialogProps {
  archive: MpqArchiveItem;
  /** 该批次是否已推送到分发端 */
  pushedToDistro: boolean;
  /** 分发端是否可达（不可达时无法判断是否已推送） */
  distroReachable: boolean;
  mutation: UseMutationResult<MpqArchiveDeleteResult, Error, string>;
  /** 是否同时删除分发端副本 */
  alsoDeleteDistro: boolean;
  onAlsoDeleteDistroChange: (value: boolean) => void;
  distroDeleteMutation?: UseMutationResult<
    DistroDeleteResult,
    Error,
    string
  >;
  onClose: () => void;
}

/**
 * 删除 MPQ 档案的确认对话框。
 *
 * 删除是不可逆的，必须把「会删什么」「会不会影响玩家」讲清楚——
 * 尤其是已推送到分发端的补丁：本地删掉不会移除分发端副本，
 * 所以提供「同时从分发端删除」避免两边状态漂移。
 */
export function DeleteArchiveDialog({
  archive,
  pushedToDistro,
  distroReachable,
  mutation,
  alsoDeleteDistro,
  onAlsoDeleteDistroChange,
  distroDeleteMutation,
  onClose,
}: DeleteArchiveDialogProps) {
  const isDistro = archive.source === "dist";
  const deletingBoth = alsoDeleteDistro && pushedToDistro;

  const handleConfirm = async () => {
    try {
      await mutation.mutateAsync(archive.rel_path);
      if (deletingBoth && distroDeleteMutation) {
        await distroDeleteMutation.mutateAsync(archive.batch);
      }
      onClose();
    } catch {
      // 失败信息由各自的 mutation 状态展示在对话框里
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
          <div className="mt-1 text-text-tertiary">
            {archive.rel_path}
          </div>
        </div>

        <div className="text-xs text-text-secondary">
          将删除该补丁文件本体（{formatBytes(archive.size)}）。同批次的
          manifest.json、changelog.md、readme.txt
          <b>保留</b>供审计；资源定义（YAML）与源 DBC{" "}
          <b>不受影响</b>，重新构建即可再生成。
        </div>

        {pushedToDistro && (
          <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              该批次<b>已推送到分发端</b>。删除只影响本地副本——
              分发端上的补丁仍可被玩家下载，需要另行处理。
            </span>
          </div>
        )}

        {pushedToDistro && (
          <label className="flex items-start gap-2 rounded-md border border-border bg-bg-surface px-3 py-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={alsoDeleteDistro}
              onChange={(e) => onAlsoDeleteDistroChange(e.target.checked)}
            />
            <span>
              <b>同时从分发端删除</b>
              <br />
              一并下线分发端上的补丁，玩家将不再能下载它（不可撤销）。
            </span>
          </label>
        )}

        {!pushedToDistro && isDistro && distroReachable && (
          <div className="rounded-md border border-border bg-bg-surface px-3 py-2 text-xs text-text-secondary">
            该批次未推送到分发端，删除后玩家不会拿到过它。
          </div>
        )}

        {mutation.data && mutation.data.reset_jobs.length > 0 && (
          <div className="rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
            引用该批次的 {mutation.data.reset_jobs.length} 个补丁任务已退回
            「待构建」，产物登记同步清空。
          </div>
        )}

        {distroDeleteMutation?.data?.error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            本地已删除，但分发端删除失败：{distroDeleteMutation.data.error}
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
