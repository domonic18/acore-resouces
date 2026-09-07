import { useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { usePatchJobDelete } from "@/features/resources/hooks/usePatchJobDelete";
import { usePatchJobs } from "@/features/resources/hooks/usePatchJobs";
import type { PatchJob } from "@/shared/types";

const STATUS_LABEL: Record<PatchJob["status"], string> = {
  requested: "待构建",
  generated: "已构建",
  applied: "已应用",
  failed: "失败",
};

const STATUS_BADGE: Record<PatchJob["status"], string> = {
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

interface PatchJobsTableProps {
  building: boolean;
  onAudit: (jobId: string) => void;
}

export function PatchJobsTable({ building, onAudit }: PatchJobsTableProps) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<PatchJob | null>(null);
  const deleteMutation = usePatchJobDelete();
  const { data, isLoading } = usePatchJobs(status || undefined, page, building);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 20)) : 1;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2 text-text-secondary">
          状态筛选
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
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
              <th>任务 ID</th>
              <th>资源</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>摘要</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((job) => (
              <tr key={job.job_id}>
                <td className="font-mono text-xs">{job.job_id}</td>
                <td>
                  <span className="font-mono text-xs text-text-tertiary">
                    #{String(job.resource_id).padStart(4, "0")}
                  </span>{" "}
                  {job.resource_name || job.resource_model_folder}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[job.status]}`}>
                    {STATUS_LABEL[job.status]}
                  </span>
                </td>
                <td className="text-text-tertiary">
                  {job.created_at
                    ? new Date(job.created_at).toLocaleString()
                    : "—"}
                </td>
                <td className="max-w-56 truncate text-xs text-text-secondary">
                  {job.summary || "—"}
                </td>
                <td>
                  <div className="flex items-center gap-1.5">
                    {job.artifacts?.output?.audit ? (
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
                      disabled={building || deleteMutation.isPending}
                      onClick={() => setPendingDelete(job)}
                      title={building ? "构建运行中，禁止删除" : "删除任务"}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> 删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-secondary">
                  暂无补丁任务
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-text-secondary">
                  加载中...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-text-tertiary">
          共 {data?.total ?? 0} 条任务
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" /> 上一页
          </button>
          <span className="text-xs text-text-secondary">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            下一页 <ChevronRight className="h-4 w-4" />
          </button>
        </div>
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
              <span className="font-mono text-xs">{pendingDelete.job_id}</span>
              （{pendingDelete.resource_name || pendingDelete.resource_model_folder}
              ）。仅移除任务目录，不影响真相源与已生成产物。
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
