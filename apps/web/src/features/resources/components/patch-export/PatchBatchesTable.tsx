import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileCheck2,
  Hammer,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { usePatchJobDelete } from "@/features/resources/hooks/usePatchJobDelete";
import { usePatchBatches } from "@/features/resources/hooks/usePatchBatches";
import {
  useBatchBuild,
  useBatchDelete,
  useBatchPublish,
} from "@/features/resources/hooks/usePatchBatchActions";
import {
  useDistroPush,
  useDistroStatus,
} from "@/features/resources/hooks/useDistroPush";
import { Dialog } from "@/shared/components/ui/Dialog";
import { artifactUrl } from "@/shared/patches";
import type { PatchBatch, PatchBatchJob, PatchBatchJobAudit } from "@/shared/types";

const STATUS_LABEL: Record<PatchBatch["status"], string> = {
  requested: "待构建",
  generated: "已构建",
  applied: "已发布",
  failed: "构建失败",
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
  { value: "applied", label: "已发布" },
  { value: "failed", label: "构建失败" },
];

function auditSummaryText(audit: PatchBatchJobAudit | null): string {
  if (!audit) return "—";
  const parts: string[] = [];
  if (audit.dbc_files.length > 0) {
    parts.push(
      audit.dbc_files.map((f) => `${f.dbc_file}×${f.record_count}`).join(" · "),
    );
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

/** 产物路径：能指向文件的就做成可点击的下载链接 */
function PathLine({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  const isDir = !/\.[A-Za-z0-9]+$/.test(value);
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-xs text-text-tertiary">{label}</span>
      {isDir ? (
        <span className="truncate font-mono text-xs text-text-secondary" title={value}>
          {value}
        </span>
      ) : (
        <a
          href={artifactUrl(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate font-mono text-xs text-accent hover:underline"
          title={`打开 ${value}`}
        >
          {value}
        </a>
      )}
    </div>
  );
}

interface PatchBatchesTableProps {
  building: boolean;
  onAudit: (jobId: string) => void;
  /** 打开校验报告：传批次号或任务 ID */
  onShowValidation: (target: { batchId?: string; jobId?: string }) => void;
}

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
  const distroStatus = useDistroStatus();
  const { data, isLoading } = usePatchBatches(status || undefined, building);
  const pushedBatches = new Set(distroStatus.data?.pushed_batches ?? []);

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
              <th>分发端</th>
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
                <BatchRows
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
                  pushed={pushedBatches.has(batch.batch_id)}
                  distroKnown={distroStatus.data?.reachable !== false}
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
        <Dialog
          open
          onClose={() => setPendingDelete(null)}
          title="确认删除任务"
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
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
          }
        >
          <p className="text-sm text-text-secondary">
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
        </Dialog>
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

interface BatchRowsProps {
  batch: PatchBatch;
  isOpen: boolean;
  sqlCount: number;
  building: boolean;
  onToggle: () => void;
  onAudit: (jobId: string) => void;
  onDelete: (job: PatchBatchJob) => void;
  onShowValidation: (target: { batchId?: string; jobId?: string }) => void;
  onRebuild: (batch: PatchBatch) => void;
  onPublish: (batch: PatchBatch) => void;
  onDeleteBatch: (batch: PatchBatch) => void;
  /** 该批次是否已推送到分发端 */
  pushed: boolean;
  /** 是否已知分发端状态（不可达时为 false） */
  distroKnown: boolean;
}

function BatchRows({
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
  pushed,
  distroKnown,
}: BatchRowsProps) {
  const isPending = batch.batch_id === "pending";
  const hasMpq = Boolean(batch.output.mpq);
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
        <td>
          {!distroKnown ? (
            <span className="text-xs text-text-tertiary" title="分发端不可达">
              未知
            </span>
          ) : pushed ? (
            <span className="badge badge-success">已推送</span>
          ) : (
            <span className="badge badge-gray">未推送</span>
          )}
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
              disabled={building}
              title={building ? "构建运行中" : "重新构建这个批次"}
              onClick={() => onRebuild(batch)}
            >
              <Hammer className="h-3.5 w-3.5" />
              重建
            </button>
            {hasMpq && batch.status !== "applied" && (
              <button
                type="button"
                className="btn btn-sm"
                title="发布这个批次到分发目录"
                onClick={() => onPublish(batch)}
              >
                <UploadCloud className="h-3.5 w-3.5" />
                发布
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={building}
              title={building ? "构建运行中，禁止删除" : "删除这个批次下的全部任务"}
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
          <td colSpan={6} className="bg-bg-elevated/40">
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

interface BatchDetailProps {
  batch: PatchBatch;
  building: boolean;
  onAudit: (jobId: string) => void;
  onDelete: (job: PatchBatchJob) => void;
  onShowValidation: (target: { batchId?: string; jobId?: string }) => void;
}

function BatchDetail({
  batch,
  building,
  onAudit,
  onDelete,
  onShowValidation,
}: BatchDetailProps) {
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
                  <a
                    key={f}
                    href={artifactUrl(f)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-mono text-xs text-accent hover:underline"
                    title={f}
                  >
                    {f}
                  </a>
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
            <th style={{ textAlign: "right" }}>操作</th>
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
                {job.completed_at
                  ? new Date(job.completed_at).toLocaleString()
                  : "—"}
              </td>
              <td
                className="max-w-72 truncate text-xs text-text-secondary"
                title={auditSummaryText(job.audit)}
              >
                {auditSummaryText(job.audit)}
              </td>
              <td>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    className="btn btn-sm"
                    title="查看这个任务的校验报告"
                    onClick={() => onShowValidation({ jobId: job.job_id })}
                  >
                    校验
                  </button>
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
                  <Link
                    to={`/resources/mount/${job.resource_id}`}
                    className="btn btn-sm"
                    title="打开资源详情页"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    详情
                  </Link>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={building}
                    onClick={() => onDelete(job)}
                    title={building ? "构建运行中，禁止删除" : "删除任务"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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

function BatchDeleteDialog({
  batch,
  onClose,
  mutation,
}: {
  batch: PatchBatch;
  onClose: () => void;
  mutation: ReturnType<typeof useBatchDelete>;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="确认删除批次"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(batch.batch_id, { onSuccess: onClose })
            }
          >
            {mutation.isPending ? "删除中..." : "确认删除"}
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        将删除批次{" "}
        <span className="font-mono text-xs">{batch.batch_id}</span> 下的{" "}
        {batch.job_count} 个补丁任务。仅移除任务目录，不影响真相源与已生成的
        DBC / SQL / MPQ 产物。
      </p>
      {mutation.isError && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "删除失败"}
        </div>
      )}
    </Dialog>
  );
}

function BatchRebuildDialog({
  batch,
  onClose,
}: {
  batch: PatchBatch;
  onClose: () => void;
}) {
  const [dryRun, setDryRun] = useState(true);
  const build = useBatchBuild();
  const jobIds = batch.jobs.map((job) => job.job_id);

  return (
    <Dialog
      open
      onClose={onClose}
      title="重建批次"
      subtitle={`批次 ${batch.batch_id} · ${batch.job_count} 只坐骑`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={build.isPending || jobIds.length === 0}
            onClick={() =>
              build.mutate(
                { jobIds, dryRun },
                { onSuccess: onClose },
              )
            }
          >
            {build.isPending ? "启动中..." : dryRun ? "开始试运行" : "开始构建"}
          </button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            checked={dryRun}
            onChange={() => setDryRun(true)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
          />
          <span>
            <span className="text-text-primary">先试运行</span>
            <span className="ml-2 text-xs text-text-tertiary">
              只检查 ID 冲突并生成计划，不修改任何文件
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="radio"
            checked={!dryRun}
            onChange={() => setDryRun(false)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-500"
          />
          <span>
            <span className="text-danger">正式构建</span>
            <span className="ml-2 text-xs text-text-tertiary">
              会改写源 DBC 记录并生成 SQL 补丁
            </span>
          </span>
        </label>
      </div>
      <p className="mt-3 text-xs text-text-tertiary">
        构建只处理这 {batch.job_count} 只坐骑，不影响其它待处理任务。
      </p>
      {build.isError && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {build.error instanceof Error ? build.error.message : "启动构建失败"}
        </div>
      )}
    </Dialog>
  );
}

function BatchPublishDialog({
  batch,
  onClose,
}: {
  batch: PatchBatch;
  onClose: () => void;
}) {
  const [startNumber, setStartNumber] = useState(5);
  const publish = useBatchPublish();
  const push = useDistroPush();
  const distroStatus = useDistroStatus();
  const alreadyPushed = Boolean(
    distroStatus.data?.pushed_batches.includes(batch.batch_id),
  );

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
            className="btn btn-sm"
            disabled={push.isPending || alreadyPushed}
            onClick={() =>
              push.mutate({ batch_ids: [batch.batch_id] })
            }
          >
            {push.isPending
              ? "推送中..."
              : alreadyPushed
                ? "已推送到分发端"
                : "推送到分发端"}
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
          发布后会自动推送到分发端，请确认目标环境正确。
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

      {push.isSuccess && push.data && (
        <div className="mt-3 space-y-1 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <div className="font-semibold">
            已推送 {push.data.pushed.length} 个批次
          </div>
          {push.data.cleaned.length > 0 && (
            <div className="text-text-secondary">
              本地副本已清理：
              {push.data.cleaned
                .map(
                  (item) =>
                    `${item.batch} 释放 ${(item.freed_bytes / 1024 / 1024).toFixed(1)} MB`,
                )
                .join("；")}
            </div>
          )}
          {push.data.failed.length > 0 && (
            <div className="text-warning">
              推送失败：
              {push.data.failed
                .map((item) => `${item.batch}（${item.error}）`)
                .join("、")}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
