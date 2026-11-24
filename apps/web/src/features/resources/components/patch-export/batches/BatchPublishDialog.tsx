import { useState } from "react";
import { useBatchPublish } from "@/features/resources/hooks/usePatchBatchActions";
import { Dialog } from "@/shared/components/ui/Dialog";
import type { PatchBatch } from "@/shared/types";

interface BatchPublishDialogProps {
  batch: PatchBatch;
  onClose: () => void;
}

/** 发布批次到分发目录 */
export function BatchPublishDialog({ batch, onClose }: BatchPublishDialogProps) {
  const [startNumber, setStartNumber] = useState(5);
  const publish = useBatchPublish();

  return (
    <Dialog
      open
      onClose={onClose}
      title="发布批次"
      subtitle={`批次 ${batch.batch_id}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {publish.isSuccess ? "关闭" : "取消"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={publish.isPending || publish.isSuccess}
            onClick={() =>
              publish.mutate({
                batchIds: [batch.batch_id],
                startNumber,
              })
            }
          >
            {publish.isPending
              ? "发布中..."
              : publish.isSuccess
                ? "已发布"
                : "确认发布"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-text-secondary">
          会把这个批次的补丁包移到{" "}
          <code className="font-mono text-text-primary">workspace/dist/</code>{" "}
          并重命名为客户端可识别的{" "}
          <code className="font-mono text-text-primary">
            patch-zhCN-编号.mpq
          </code>
          。
        </p>
        <label className="flex items-center gap-2">
          补丁编号
          <input
            type="number"
            min={1}
            value={startNumber}
            onChange={(e) => setStartNumber(Number(e.target.value) || 1)}
            className="w-20 rounded-md border border-border bg-bg-elevated px-2 py-1 text-sm"
          />
          <span className="text-xs text-text-tertiary">
            实际编号会避开已发布的补丁
          </span>
        </label>
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          发布即上架：批次会立即出现在玩家「补丁下载」页，请确认目标环境正确。
        </div>
      </div>
      {publish.isError && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {publish.error instanceof Error
            ? publish.error.message
            : "发布失败"}
        </div>
      )}

      {publish.isSuccess && publish.data && (
        <div className="mt-3 space-y-1 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <div className="font-semibold">
            已发布 {publish.data.preview.length} 个批次
            （下一个可用编号 {publish.data.next_number}）
          </div>
          <ul className="space-y-0.5 text-text-secondary">
            {publish.data.preview.map((item) => (
              <li key={item.batch} className="break-all">
                补丁 #{item.patch_number} · {item.batch} → {item.path}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
