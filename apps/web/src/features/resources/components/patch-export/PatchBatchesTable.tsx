import { useState } from "react";
import { usePatchJobDelete } from "@/features/resources/hooks/usePatchJobDelete";
import { usePatchBatches } from "@/features/resources/hooks/usePatchBatches";
import { useBatchDelete } from "@/features/resources/hooks/usePatchBatchActions";
import { BatchCard } from "./batches/BatchCard";
import { BatchDeleteDialog } from "./batches/BatchDeleteDialog";
import { BatchPublishDialog } from "./batches/BatchPublishDialog";
import { BatchRebuildDialog } from "./batches/BatchRebuildDialog";
import { JobDeleteDialog } from "./batches/JobDeleteDialog";
import { STATUS_OPTIONS } from "./batches/batchStatus";
import type { ShowValidationTarget } from "./batches/types";
import type { PatchBatch, PatchBatchJob } from "@/shared/types";

interface PatchBatchesTableProps {
  building: boolean;
  onAudit: (jobId: string) => void;
  /** 打开校验报告：传批次号或任务 ID */
  onShowValidation: (target: ShowValidationTarget) => void;
  /** 批次「重建」：把该批任务带入左侧向导的构建步骤 */
  onRebuildHandover: (jobIds: string[]) => void;
}

/** 补丁批次管理（admin 视角）：状态筛选 + 批次卡片流 + 操作对话框编排骨架。 */
export function PatchBatchesTable({
  building,
  onAudit,
  onShowValidation,
  onRebuildHandover,
}: PatchBatchesTableProps) {
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PatchBatchJob | null>(null);
  const [pendingBatchDelete, setPendingBatchDelete] =
    useState<PatchBatch | null>(null);
  const [rebuildTarget, setRebuildTarget] = useState<PatchBatch | null>(null);
  const [publishTarget, setPublishTarget] = useState<PatchBatch | null>(null);

  const deleteMutation = usePatchJobDelete();
  const batchDeleteMutation = useBatchDelete();
  const { data, isLoading } = usePatchBatches(status || undefined, building);

  const toggle = (batchId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  const batches = data?.items ?? [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2 text-text-secondary">
          状态
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {building && (
          <span className="text-xs text-text-tertiary">
            构建中，列表自动刷新...
          </span>
        )}
        <span className="ml-auto text-xs text-text-tertiary">
          共 {data?.total ?? 0} 个批次
        </span>
      </div>

      <div className="space-y-2">
        {batches.map((batch) => {
          const sqlFiles = batch.output.sql_files ?? [];
          return (
            <BatchCard
              key={batch.batch_id}
              batch={batch}
              isOpen={expanded.has(batch.batch_id)}
              sqlCount={sqlFiles.length}
              building={building}
              onToggle={() => toggle(batch.batch_id)}
              onAudit={onAudit}
              onDelete={setPendingDelete}
              onShowValidation={onShowValidation}
              onRebuild={setRebuildTarget}
              onPublish={setPublishTarget}
              onDeleteBatch={setPendingBatchDelete}
            />
          );
        })}
        {!isLoading && batches.length === 0 && (
          <div className="py-8 text-center text-sm text-text-secondary">
            暂无补丁批次
          </div>
        )}
        {isLoading && (
          <div className="py-8 text-center text-sm text-text-tertiary">
            加载中...
          </div>
        )}
      </div>

      {pendingDelete && (
        <JobDeleteDialog
          job={pendingDelete}
          onClose={() => setPendingDelete(null)}
          mutation={deleteMutation}
        />
      )}

      {pendingBatchDelete && (
        <BatchDeleteDialog
          batch={pendingBatchDelete}
          onClose={() => setPendingBatchDelete(null)}
          mutation={batchDeleteMutation}
        />
      )}

      {rebuildTarget && (
        <BatchRebuildDialog
          batch={rebuildTarget}
          onConfirm={onRebuildHandover}
          onClose={() => setRebuildTarget(null)}
        />
      )}

      {publishTarget && (
        <BatchPublishDialog
          batch={publishTarget}
          onClose={() => setPublishTarget(null)}
        />
      )}
    </div>
  );
}
