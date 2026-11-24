import { Link } from "react-router-dom";
import { ExternalLink, Trash2 } from "lucide-react";
import { useCanWrite } from "@/features/auth/useAuth";
import { artifactUrl } from "@/shared/patches";
import { auditSummaryText, STATUS_BADGE, STATUS_LABEL } from "./batchStatus";
import { PathLine } from "./PathLine";
import type { BatchDetailProps } from "./types";

/** 展开后的批次详情：产物路径清单 + 任务子表 */
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
                  {job.has_validation_report ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      title="查看这个任务的校验报告"
                      onClick={() => onShowValidation({ jobId: job.job_id })}
                    >
                      校验
                    </button>
                  ) : (
                    <span
                      className="text-xs text-text-tertiary"
                      title="该任务没有校验报告——它从未成功构建过（试运行不产出报告）"
                    >
                      校验—
                    </span>
                  )}
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
