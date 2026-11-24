import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, GitCompareArrows, Loader2 } from "lucide-react";
import { Dialog } from "@/shared/components/ui/Dialog";
import { usePatchBatches } from "@/features/resources/hooks/usePatchBatches";
import { useBatchCompare } from "@/features/resources/hooks/useBatchCompare";

interface BatchCompareDialogProps {
  /** 基准批次（点「对比」的那个） */
  batchId: string;
  onClose: () => void;
}

function FileList({
  tone,
  label,
  paths,
}: {
  tone: string;
  label: string;
  paths: string[];
}) {
  if (paths.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
        <span className={`badge ${tone}`}>{label}</span>
        <span className="text-text-tertiary">{paths.length} 个</span>
      </div>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border bg-bg-surface px-2 py-1.5">
        {paths.map((path) => (
          <li key={path} className="truncate font-mono text-xs" title={path}>
            {path}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 任选两批次产物对比：基准批次固定，拉选对比批次，展示文件/坐骑差异。 */
export function BatchCompareDialog({
  batchId,
  onClose,
}: BatchCompareDialogProps) {
  // 拉全量批次列表做对比对象选择（pending 批次无审计报告，排除）
  const { data } = usePatchBatches(undefined, false);
  const candidates = useMemo(
    () => (data?.items ?? []).filter((b) => b.batch_id !== batchId && b.batch_id !== "pending"),
    [data, batchId],
  );

  // 默认选「上一批」：列表按时间倒序，当前批次之后第一个即为更早的一批
  const [against, setAgainst] = useState<string>("");
  useEffect(() => {
    if (!against && candidates.length > 0) setAgainst(candidates[0].batch_id);
  }, [against, candidates]);

  const compare = useBatchCompare(
    batchId,
    against || null,
  );

  const compareBatchName = (batchIdKey: string) => {
    const item = (data?.items ?? []).find((b) => b.batch_id === batchIdKey);
    return item?.created_at
      ? new Date(item.created_at).toLocaleString()
      : batchIdKey;
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="批次对比"
      subtitle={`基准批次 ${compareBatchName(batchId)}；差值方向为「对比批次相对基准批次」`}
      size="lg"
      footer={
        <div className="flex justify-end">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            关闭
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <GitCompareArrows className="h-4 w-4 shrink-0 text-text-tertiary" />
          <span className="shrink-0 text-text-secondary">对比批次</span>
          <select
            value={against}
            onChange={(e) => setAgainst(e.target.value)}
            className="filter-select min-w-0 flex-1"
          >
            {candidates.map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {compareBatchName(b.batch_id)} · {b.batch_id} · {b.job_count} 只
              </option>
            ))}
          </select>
        </label>

        {candidates.length === 0 && (
          <div className="rounded-md border border-border bg-bg-surface px-3 py-4 text-center text-xs text-text-tertiary">
            没有可对比的其它批次（pending 批次没有审计报告，无法参与对比）。
          </div>
        )}

        {compare.isLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            对比中...
          </div>
        )}

        {compare.isError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {compare.error instanceof Error
              ? compare.error.message
              : "对比失败"}
          </div>
        )}

        {compare.data && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span className={`badge ${compare.data.files_added.length > 0 ? "badge-success" : "badge-gray"}`}>
                新增 {compare.data.files_added.length}
              </span>
              <span className={`badge ${compare.data.files_removed.length > 0 ? "badge-danger" : "badge-gray"}`}>
                移除 {compare.data.files_removed.length}
              </span>
              <span className={`badge ${compare.data.files_replaced.length > 0 ? "badge-warning" : "badge-gray"}`}>
                变更 {compare.data.files_replaced.length}
              </span>
              <span className="badge badge-gray">
                未变 {compare.data.files_unchanged_count}
              </span>
              <span className="text-text-tertiary">（MPQ 文件清单，按 path+sha256 对比）</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <FileList
                tone="badge-success"
                label="新增（仅对比批次有）"
                paths={compare.data.files_added}
              />
              <FileList
                tone="badge-danger"
                label="移除（仅基准批次有）"
                paths={compare.data.files_removed}
              />
            </div>

            {compare.data.files_replaced.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                  <span className="badge badge-warning">变更</span>
                  <span className="text-text-tertiary">
                    同路径不同内容 · {compare.data.files_replaced.length} 个
                  </span>
                </div>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border bg-bg-surface px-2 py-1.5">
                  {compare.data.files_replaced.map((entry) => (
                    <li
                      key={entry.path}
                      className="truncate font-mono text-xs"
                      title={`${entry.path}\n基准 ${entry.sha_base ?? "—"}\n对比 ${entry.sha_against ?? "—"}`}
                    >
                      {entry.path}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border border-border px-3 py-2">
              <div className="mb-1 text-xs font-semibold text-text-secondary">
                坐骑任务
              </div>
              <div className="space-y-0.5 text-xs">
                {compare.data.jobs_added.length > 0 && (
                  <div>
                    <span className="badge badge-success">新增</span>{" "}
                    <span className="text-text-secondary">
                      {compare.data.jobs_added
                        .map((j) => j.resource_name || j.job_id)
                        .join("、")}
                    </span>
                  </div>
                )}
                {compare.data.jobs_removed.length > 0 && (
                  <div>
                    <span className="badge badge-danger">移除</span>{" "}
                    <span className="text-text-secondary">
                      {compare.data.jobs_removed
                        .map((j) => j.resource_name || j.job_id)
                        .join("、")}
                    </span>
                  </div>
                )}
                <div className="text-text-tertiary">
                  两批共有 {compare.data.jobs_common.length} 只坐骑
                </div>
              </div>
            </div>

            {compare.data.files_added.length === 0 &&
              compare.data.files_removed.length === 0 &&
              compare.data.files_replaced.length === 0 && (
                <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-text-tertiary">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  两个批次的 MPQ 文件清单完全一致。
                </div>
              )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
