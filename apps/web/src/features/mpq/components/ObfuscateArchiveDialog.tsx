import { EyeOff, ShieldAlert } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Dialog } from "@/shared/components/ui/Dialog";
import { formatBytes } from "@/shared/format";
import type { MpqArchiveItem } from "@/shared/types";

interface ObfuscateArchiveDialogProps {
  archive: MpqArchiveItem;
  mutation: UseMutationResult<{
    rel_path: string;
    obfuscation: string;
    obfuscated_at: string;
  }, Error, string>;
  onClose: () => void;
}

/**
 * basic 混淆确认对话框。
 *
 * 混淆不可逆：剥除档案内 (listfile)/(attributes) 后第三方工具无法再
 * 枚举内容。必须把「游戏不受影响」「无法恢复」「按路径提取仍可用」讲清楚。
 */
export function ObfuscateArchiveDialog({
  archive,
  mutation,
  onClose,
}: ObfuscateArchiveDialogProps) {
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
      title="混淆补丁档案"
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
            className="btn btn-sm btn-primary"
            disabled={mutation.isPending}
            onClick={handleConfirm}
          >
            <EyeOff className="h-3.5 w-3.5" />
            {mutation.isPending ? "混淆中..." : "确认混淆"}
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
          basic 混淆会永久剥除档案内的 (listfile) 与 (attributes)
          内部文件：第三方 MPQ 工具将无法枚举补丁内容。游戏客户端按路径哈希
          定位文件，<b>加载不受任何影响</b>；按显式路径提取也仍可用。
        </div>

        <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            混淆<b>不可逆</b>：无法还原档案内文件清单。如需重新枚举，只能
            重新构建该批次补丁。
          </span>
        </div>

        {mutation.isError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {mutation.error instanceof Error
              ? mutation.error.message
              : "混淆失败"}
          </div>
        )}
      </div>
    </Dialog>
  );
}
