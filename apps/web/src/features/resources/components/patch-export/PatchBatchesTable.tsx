import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Trash2 } from "lucide-react";
import { usePatchJobDelete } from "@/features/resources/hooks/usePatchJobDelete";
import { usePatchBatches } from "@/features/resources/hooks/usePatchBatches";
import type { PatchBatch, PatchBatchJob, PatchBatchJobAudit } from "@/shared/types";

const STATUS_LABEL: Record<PatchBatch["status"], string> = {
  requested: "待构建",
  generated: "已构建",
  applied: "已应用",
  failed: "失败",
};

const STATUS_BADGE: Record<PatchBatch["status"], string> = {
  requested: "badge-blue",
  generated: "badge-green",
  applied: "badge-gray",
  failed: "badge-danger",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "requested", label: "待构建" },
  { value: "generated", label: "已构建" },
  { value: "applied", label: "已应用" },
  { value: "failed", label: "失败" },
];

function auditSummaryText(audit: PatchBatchJobAudit | null): string {
  if (!audit) return "—";
  const parts: string[] = [];
  if (audit.dbc_files.length > 0) {
    parts.push(audit.dbc_files.map((f) => `${f.dbc_file}×${f.record_count}`).join(" · "));
  }
  if (audit.sql_tables.length > 0) {
    const sqlName = audit.sql_file ? audit.sql_file.split("/").pop() : null;
    const head = sqlName ? `SQL ${sqlName}` : "SQL";
    parts.push(
      `${head}: ${audit.sql_tables.map((t) => `${t.name}(${t.record_count})`).join("+")}`,
    );
  }
  return parts.join(" ｜ ") || "—";
}

function PathLine({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-xs text-text-tertiary">{label}</span>
      <span className="truncate font-mono text-xs text-text-secondary" title={value}>
        {value}
      </span>
    </div>
  );
}

interface PatchBatchesTableProps {
  building: boolean;
  onAudit: (jobId: string) => void;
}

export function PatchBatchesTable({ building, onAudit }: PatchBatchesTableProps) {
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PatchBatchJob | null>(null);
  const deleteMutation = usePatchJobDelete();
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
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => {
              const isOpen = expanded.has(batch.batch_id);
              const sqlFiles = batch.output.sql_files ?? [];
              return (
                <BatchRows
                  key={batch.batch_id}
                  batch={batch}
                  isOpen={isOpen}
                  sqlCount={sqlFiles.length}
                  building={building}
                  onToggle={() => toggle(batch.batch_id)}
                  onAudit={onAudit}
                  onDelete={setPendingDelete}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-text-primary">
              确认删除任务
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              将删除{" "}
              <span className="font-mono text-xs">{pendingDelete.job_id}</span>（
              {pendingDelete.resource_name}）。仅移除任务目录，不影响真相源与已生成产物。
            </p>
            {deleteMutation.isError && (
              <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {deleteMutation.error instanceof Error
                  ? deleteMutation.error.message
                  : "删除失败"}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate(pendingDelete.job_id, {
                    onSuccess: () => setPendingDelete(null),
                  })
                }
              >
                {deleteMutation.isPending ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BatchRowsProps {
  batch: PatchBatch;
  isOpen: boolean;
  sqlCount: number;
  building: boolean;
  onToggle: () => void;
  onAudit: (jobId: string) => void;
  onDelete: (job: PatchBatchJob) => void;
}

function BatchRows({
  batch,
  isOpen,
  sqlCount,
  building,
  onToggle,
  onAudit,
  onDelete,
}: BatchRowsProps) {
  const isPending = batch.batch_id === "pending";
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
          <button
            type="button"
            className="btn btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {isOpen ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> 收起
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> 展开
              </>
            )}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td />
          <td colSpan={6} className="bg-bg-elevated/40">
            <BatchDetail
              batch={batch}
              building={building}
              onAudit={onAudit}
              onDelete={onDelete}
            />
          </td>
        </tr>
      )}
    </>
  );
}

interface BatchDetailProps {
  batch: PatchBatch;
  building: boolean;
  onAudit: (jobId: string) => void;
  onDelete: (job: PatchBatchJob) => void;
}

function BatchDetail({ batch, building, onAudit, onDelete }: BatchDetailProps) {
  const isPending = batch.batch_id === "pending";
  const sqlFiles = batch.output.sql_files ?? [];
  return (
    <div className="space-y-3 py-2">
      {!isPending && (
        <div className="space-y-0.5">
          <PathLine label="补丁包" value={batch.output.mpq} />
          <PathLine label="批次清单" value={batch.output.manifest} />
          <PathLine label="变更日志" value={batch.output.changelog} />
          <PathLine label="说明文件" value={batch.output.readme} />
          <PathLine label="DBC 源目录" value={batch.output.dbc_dir} />
          <PathLine label="校验报告" value={batch.output.validation_report} />
          <PathLine label="审计报告" value={batch.output.audit} />
          {sqlFiles.length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 text-xs text-text-tertiary">
                SQL 文件（{sqlFiles.length}）
              </span>
              <div className="min-w-0">
                {sqlFiles.map((f) => (
                  <div
                    key={f}
                    className="truncate font-mono text-xs text-text-secondary"
                    title={f}
                  >
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <table className="data-table w-full">
        <thead>
          <tr>
            <th>资源</th>
            <th>状态</th>
            <th>完成时间</th>
            <th>变更摘要（DBC / SQL）</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {batch.jobs.map((job) => (
            <tr key={job.job_id}>
              <td>
                <span className="font-mono text-xs text-text-tertiary">
                  #{String(job.resource_id).padStart(4, "0")}
                </span>{" "}
                {job.resource_name}
              </td>
              <td>
                <span className={`badge ${STATUS_BADGE[job.status]}`}>
                  {STATUS_LABEL[job.status]}
                </span>
              </td>
              <td className="text-xs text-text-tertiary">
                {job.completed_at ? new Date(job.completed_at).toLocaleString() : "—"}
              </td>
              <td
                className="max-w-72 truncate text-xs text-text-secondary"
                title={auditSummaryText(job.audit)}
              >
                {auditSummaryText(job.audit)}
              </td>
              <td>
                <div className="flex items-center gap-1.5">
                  {job.audit ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onAudit(job.job_id)}
                    >
                      审计
                    </button>
                  ) : (
                    <span className="text-xs text-text-tertiary">—</span>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={building}
                    onClick={() => onDelete(job)}
                    title={building ? "构建运行中，禁止删除" : "删除任务"}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
