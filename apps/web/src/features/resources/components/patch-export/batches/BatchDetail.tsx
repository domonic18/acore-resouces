import { Link } from "react-router-dom";
import {
  ExternalLink,
  FileCheck2,
  FileSearch,
  Trash2,
} from "lucide-react";
import { useCanWrite } from "@/features/auth/useAuth";
import { artifactUrl } from "@/shared/patches";
import { auditSummaryText, STATUS_BADGE, STATUS_LABEL } from "./batchStatus";
import { PathLine } from "./PathLine";
import type { BatchDetailProps } from "./types";

/** 展开后的批次详情：产物路径清单 + 任务紧凑列表（侧栏宽度友好） */
export function BatchDetail({
  batch,
  building,
  onAudit,
  onDelete,
  onShowValidation,
}: BatchDetailProps) {
  const isPending = batch.batch_id === "pending";
  const sqlFiles = batch.output.sql_files ?? [];
  const canWrite = useCanWrite();
  return (
    <div className="space-y-3 pt-1">
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

      <div className="space-y-1.5">
        {batch.jobs.map((job) => {
          const summary = auditSummaryText(job.audit);
          return (
            <div
              key={job.job_id}
              className="rounded border border-border px-2 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-mono text-xs text-text-tertiary">
                  #{String(job.resource_id).padStart(4, "0")}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-sm text-text-primary"
                  title={job.resource_name}
                >
                  {job.resource_name}
                </span>
                <span className={`badge ${STATUS_BADGE[job.status]}`}>
                  {STATUS_LABEL[job.status]}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  className="min-w-0 flex-1 truncate text-xs text-text-tertiary"
                  title={`变更摘要：${summary || "—"}${
                    job.completed_at
                      ? `\n完成于 ${new Date(job.completed_at).toLocaleString()}`
                      : ""
                  }`}
                >
                  {summary || "—"}
                </span>
                {job.has_validation_report ? (
                  <button
                    type="button"
                    className="btn btn-sm shrink-0 px-1.5"
                    title="查看这个任务的校验报告"
                    onClick={() => onShowValidation({ jobId: job.job_id })}
                  >
                    <FileCheck2 className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span
                    className="shrink-0 px-1.5 text-xs text-text-tertiary"
                    title="该任务没有校验报告——它从未成功构建过（试运行不产出报告）"
                  >
                    <FileCheck2 className="h-3.5 w-3.5 opacity-40" />
                  </span>
                )}
                {job.audit ? (
                  <button
                    type="button"
                    className="btn btn-sm shrink-0 px-1.5"
                    title="查看这个任务的 DBC/SQL 审计"
                    onClick={() => onAudit(job.job_id)}
                  >
                    <FileSearch className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span
                    className="shrink-0 px-1.5"
                    title="该任务没有审计数据"
                  >
                    <FileSearch className="h-3.5 w-3.5 opacity-40" />
                  </span>
                )}
                <Link
                  to={`/resources/mount/${job.resource_id}`}
                  className="btn btn-sm shrink-0 px-1.5"
                  title="打开资源详情页"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  className="btn btn-sm btn-danger shrink-0 px-1.5"
                  disabled={!canWrite || building}
                  onClick={() => onDelete(job)}
                  title={
                    !canWrite
                      ? "仅管理员可删除"
                      : building
                        ? "构建运行中，禁止删除"
                        : "删除任务"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
