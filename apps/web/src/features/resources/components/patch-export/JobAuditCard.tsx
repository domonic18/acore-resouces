import { Download, FileSearch, X } from "lucide-react";
import { usePatchJobAudit } from "@/features/resources/hooks/usePatchJobAudit";
import { getPatchJobAuditUrl } from "@/shared/patches";
import type { AuditDbcEntry } from "@/shared/types";

const MPQ_FILE_PREVIEW_COUNT = 30;

interface JobAuditCardProps {
  jobId: string;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function DbcChangeTable({ entries }: { entries: AuditDbcEntry[] }) {
  return (
    <table className="data-table w-full">
      <thead>
        <tr>
          <th>文件 · 记录</th>
          <th>字段</th>
          <th>变更</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) =>
          Object.entries(entry.after).map(([field, newValue], idx) => {
            const oldValue = entry.before?.[field];
            return (
              <tr key={`${entry.dbc_file}-${entry.record_id}-${field}`}>
                {idx === 0 && (
                  <td rowSpan={Object.keys(entry.after).length}>
                    <span className="font-mono text-xs">
                      {entry.dbc_file}
                      <br />#{entry.record_id}
                    </span>
                  </td>
                )}
                <td className="font-mono text-xs">{field}</td>
                <td className="text-xs">
                  {entry.action_taken === "skipped_existing" ? (
                    <span className="text-warning">
                      源已存在，跳过（现值 {String(oldValue ?? "—")}）
                    </span>
                  ) : entry.before === null ? (
                    <>
                      <span className="text-text-tertiary">新增记录</span>{" "}
                      → <span className="text-success">{String(newValue)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-text-tertiary line-through">
                        {String(oldValue ?? "—")}
                      </span>{" "}
                      → <span className="text-success">{String(newValue)}</span>
                    </>
                  )}
                </td>
              </tr>
            );
          }),
        )}
        {entries.length === 0 && (
          <tr>
            <td colSpan={3} className="py-6 text-center text-text-secondary">
              无 DBC 变更记录
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function JobAuditCard({ jobId, onClose }: JobAuditCardProps) {
  const { data, isLoading, error } = usePatchJobAudit(jobId);

  const mpqFiles = data?.mpq?.files ?? [];
  const countsText = data?.mpq
    ? Object.entries(data.mpq.counts_by_kind)
        .map(([kind, count]) => `${count} ${kind}`)
        .join(" + ")
    : "";

  return (
    <div className="card mt-6" id="audit">
      <div className="card-header">
        <div>
          <div className="card-title flex items-center gap-2">
            <FileSearch className="h-4 w-4" /> 任务审计 · {jobId}{" "}
            {data?.resource_name ?? ""}
          </div>
          <div className="card-subtitle font-mono">
            audit-report.json · workspace/reports/{data?.report?.batch ?? "…"}/ ·
            构建时由服务层生成（CLI patch audit 输出同一报告）
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="btn btn-sm"
            href={getPatchJobAuditUrl(jobId)}
            download={`audit-${jobId}.json`}
          >
            <Download className="h-4 w-4" /> 下载报告 JSON
          </a>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            <X className="h-4 w-4" /> 关闭
          </button>
        </div>
      </div>
      <div className="card-body">
        {isLoading && (
          <div className="py-8 text-center text-text-secondary">
            加载审计报告...
          </div>
        )}
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            审计报告加载失败：{error.message}
          </div>
        )}
        {data && (
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <div className="form-label mb-2">DBC 字段变更（before → after）</div>
              <div className="max-h-72 overflow-y-auto">
                <DbcChangeTable entries={data.dbc} />
              </div>
            </div>
            <div>
              <div className="form-label mb-2">SQL 补丁字段</div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-bg-elevated p-3 font-mono text-xs leading-5">
                {data.sql ? (
                  <>
                    <div
                      className={
                        data.sql.status === "written"
                          ? "text-success"
                          : "text-text-tertiary"
                      }
                    >
                      {data.sql.status === "written" ? "+" : "="}{" "}
                      {data.sql.output_sql_file}
                      {data.sql.status === "written"
                        ? "（新增）"
                        : "（已存在，未重写）"}
                    </div>
                    {data.sql.tables.map((table) =>
                      table.records.map((record, recordIdx) =>
                        Object.entries(record).map(([field, value]) => (
                          <div key={`${table.name}-${recordIdx}-${field}`} className="pl-3">
                            {table.name}.
                            {table.records.length > 1 ? `[${recordIdx}].` : ""}
                            {field} = {String(value)}
                          </div>
                        )),
                      ),
                    )}
                  </>
                ) : (
                  <div className="text-text-secondary">无 SQL 计划</div>
                )}
              </div>
            </div>
            <div>
              <div className="form-label mb-2">MPQ 清单（manifest.json）</div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-bg-elevated p-3 font-mono text-xs leading-5">
                {data.mpq ? (
                  <>
                    <div className="text-info">批次 {data.mpq.batch}</div>
                    <div>混淆等级: {data.mpq.obfuscation}</div>
                    <div>
                      文件数: {data.mpq.file_count}（{countsText}）
                    </div>
                    {data.mpq.diff && (
                      <div className="text-text-tertiary">
                        与上一批次: 新增 {data.mpq.diff.added.length} / 替换{" "}
                        {data.mpq.diff.replaced.length} / 沿用{" "}
                        {data.mpq.diff.unchanged.length}
                      </div>
                    )}
                    {mpqFiles.slice(0, MPQ_FILE_PREVIEW_COUNT).map((file) => (
                      <div key={file.path}>
                        {file.path}{" "}
                        <span className="text-text-tertiary">
                          {formatSize(file.size_bytes)}
                        </span>
                      </div>
                    ))}
                    {mpqFiles.length > MPQ_FILE_PREVIEW_COUNT && (
                      <div className="text-text-tertiary">
                        … 共 {mpqFiles.length} 个文件，下载报告 JSON 查看全量
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-text-secondary">无 MPQ 清单</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
