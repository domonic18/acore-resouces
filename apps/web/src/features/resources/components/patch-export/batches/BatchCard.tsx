import {
  ChevronDown,
  ChevronRight,
  FileCheck2,
  GitCompareArrows,
  Hammer,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCanWrite } from "@/features/auth/useAuth";
import { STATUS_BADGE, STATUS_LABEL } from "./batchStatus";
import { BatchDetail } from "./BatchDetail";
import type { BatchCardProps } from "./types";

/** 侧栏批次卡片：折叠头 + 产物元信息 + 操作行，展开渲染任务详情 */
export function BatchCard({
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
  onCompare,
}: BatchCardProps) {
  const isPending = batch.batch_id === "pending";
  const hasMpq = Boolean(batch.output.mpq);
  const canWrite = useCanWrite();
  return (
    <div className="rounded-md border border-border bg-bg-surface">
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2"
        onClick={onToggle}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-text-primary">
              {batch.created_at
                ? new Date(batch.created_at).toLocaleString()
                : "—"}
            </span>
            <span className={`badge ${STATUS_BADGE[batch.status]}`}>
              {STATUS_LABEL[batch.status]}
            </span>
            <span className="badge badge-gray">{batch.job_count} 只</span>
          </div>
          <div
            className="truncate font-mono text-xs text-text-tertiary"
            title={batch.batch_id}
          >
            {batch.batch_id}
          </div>
        </div>
      </div>

      <div className="space-y-0.5 px-3 pb-2 pl-9 text-xs text-text-secondary">
        {isPending ? (
          <div className="text-text-tertiary">尚未构建</div>
        ) : (
          <>
            <div className="flex gap-2">
              <span className="w-7 shrink-0 text-text-tertiary">MPQ</span>
              <span
                className="min-w-0 flex-1 truncate font-mono"
                title={batch.output.mpq}
              >
                {batch.output.mpq}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="w-7 shrink-0 text-text-tertiary">SQL</span>
              <span>{sqlCount} 个文件</span>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
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
          title={
            !canWrite
              ? "仅管理员可操作"
              : building
                ? "构建运行中"
                : "重新构建这个批次"
          }
          onClick={() => onRebuild(batch)}
        >
          <Hammer className="h-3.5 w-3.5" />
          重建
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!batch.output.audit}
          title={
            batch.output.audit
              ? "与任一其它批次对比文件/坐骑差异"
              : "该批次没有审计报告（审计功能上线前构建），无法对比"
          }
          onClick={() => onCompare(batch)}
        >
          <GitCompareArrows className="h-3.5 w-3.5" />
          对比
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

      {isOpen && (
        <div className="border-t border-border px-3 py-2">
          <BatchDetail
            batch={batch}
            building={building}
            onAudit={onAudit}
            onDelete={onDelete}
            onShowValidation={onShowValidation}
          />
        </div>
      )}
    </div>
  );
}
