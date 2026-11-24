import type { PatchBatch, PatchBatchJobAudit } from "@/shared/types";

export const STATUS_LABEL: Record<PatchBatch["status"], string> = {
  requested: "待构建",
  generated: "已构建",
  applied: "已发布",
  failed: "构建失败",
};

export const STATUS_BADGE: Record<PatchBatch["status"], string> = {
  requested: "badge-blue",
  generated: "badge-success",
  applied: "badge-gray",
  failed: "badge-danger",
};

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "requested", label: "待构建" },
  { value: "generated", label: "已构建" },
  { value: "applied", label: "已发布" },
  { value: "failed", label: "构建失败" },
];

export function auditSummaryText(audit: PatchBatchJobAudit | null): string {
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
