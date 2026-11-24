import {
  ChevronDown,
  ChevronRight,
  FileCheck2,
  Hammer,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCanWrite } from "@/features/auth/useAuth";
import { STATUS_BADGE, STATUS_LABEL } from "./batchStatus";
import { BatchDetail } from "./BatchDetail";
import type { BatchRowProps } from "./types";

/** 批次主行 + 展开详情行（一个批次占两行） */
export function BatchRow({
  batch,
  isOpen,
  sqlCount,
  building,
  onToggle,
  onAudit,
  onDelete,
  onShowValidation,
  onRebuild,
  onPublish,
  onDeleteBatch,
}: BatchRowProps) {
  const isPending = batch.batch_id === "pending";
  const hasMpq = Boolean(batch.output.mpq);
  const canWrite = useCanWrite();
  return (
    <>
      <tr className="cursor-pointer" onClick={onToggle}>
        <td>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-tertiary" />
          )}
        </td>
        <td>
          <div className="text-sm text-text-primary">
            {batch.created_at
              ? new Date(batch.created_at).toLocaleString()
              : "—"}
          </div>
          <div className="font-mono text-xs text-text-tertiary">
            {batch.batch_id}
          </div>
        </td>
        <td>
          <span className="badge badge-gray">{batch.job_count} 只</span>
        </td>
        <td>
          <span className={`badge ${STATUS_BADGE[batch.status]}`}>
            {STATUS_LABEL[batch.status]}
          </span>
        </td>
        <td className="max-w-64">
          {isPending ? (
            <span className="text-xs text-text-tertiary">尚未构建</span>
          ) : (
            <span
              className="block truncate font-mono text-xs text-text-secondary"
              title={batch.output.mpq}
            >
              {batch.output.mpq}
            </span>
          )}
        </td>
        <td className="text-xs text-text-secondary">
          {isPending ? "—" : `${sqlCount} 个文件`}
        </td>
        <td>
          <div
            className="flex items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {batch.output.validation_report && (
              <button
                type="button"
                className="btn btn-sm"
                title="查看这个批次的校验报告"
                onClick={() => onShowValidation({ batchId: batch.batch_id })}
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                校验报告
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm"
              disabled={!canWrite || building}
              title={!canWrite ? "仅管理员可操作" : building ? "构建运行中" : "重新构建这个批次"}
              onClick={() => onRebuild(batch)}
            >
              <Hammer className="h-3.5 w-3.5" />
              重建
            </button>
            {hasMpq && batch.status !== "applied" && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={!canWrite}
                title={!canWrite ? "仅管理员可发布补丁" : "发布这个批次到分发目录"}
                onClick={() => onPublish(batch)}
              >
                <UploadCloud className="h-3.5 w-3.5" />
                发布
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={!canWrite || building}
              title={
                !canWrite
                  ? "仅管理员可删除"
                  : building
                    ? "构建运行中，禁止删除"
                    : "删除这个批次下的全部任务"
              }
              onClick={() => onDeleteBatch(batch)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td />
          <td colSpan={7} className="bg-bg-elevated/40">
            <BatchDetail
              batch={batch}
              building={building}
              onAudit={onAudit}
              onDelete={onDelete}
              onShowValidation={onShowValidation}
            />
          </td>
        </tr>
      )}
    </>
  );
}
