import { useState } from "react";
import { usePatchJobDelete } from "@/features/resources/hooks/usePatchJobDelete";
import { usePatchBatches } from "@/features/resources/hooks/usePatchBatches";
import { useBatchDelete } from "@/features/resources/hooks/usePatchBatchActions";
import { BatchDeleteDialog } from "./batches/BatchDeleteDialog";
import { BatchPublishDialog } from "./batches/BatchPublishDialog";
import { BatchRebuildDialog } from "./batches/BatchRebuildDialog";
import { BatchRow } from "./batches/BatchRow";
import { JobDeleteDialog } from "./batches/JobDeleteDialog";
import { STATUS_OPTIONS } from "./batches/batchStatus";
import type { ShowValidationTarget } from "./batches/types";
import type { PatchBatch, PatchBatchJob } from "@/shared/types";

interface PatchBatchesTableProps {
  building: boolean;
  onAudit: (jobId: string) => void;
  /** 打开校验报告：传批次号或任务 ID */
  onShowValidation: (target: ShowValidationTarget) => void;
}

/** 补丁批次管理表格（admin 视角）：状态筛选 + 批次列表 + 操作对话框编排骨架。 */
export function PatchBatchesTable({
  building,
  onAudit,
  onShowValidation,
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
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2 text-text-secondary">
          状态筛选
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
          <span className="text-xs text-text-tertiary">构建中，列表自动刷新...</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th className="w-6" />
              <th>批次</th>
              <th>坐骑数</th>
              <th>状态</th>
              <th>补丁包（MPQ）</th>
              <th>SQL</th>
              <th style={{ textAlign: "right" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => {
              const isOpen = expanded.has(batch.batch_id);
              const sqlFiles = batch.output.sql_files ?? [];
              return (
                <BatchRow
                  key={batch.batch_id}
                  batch={batch}
                  isOpen={isOpen}
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
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-secondary">
                  暂无补丁批次
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-text-secondary">
                  加载中...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-sm">
        <span className="text-text-tertiary">共 {data?.total ?? 0} 个批次</span>
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
