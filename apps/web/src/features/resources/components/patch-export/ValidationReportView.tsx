import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import { getValidationCheckLabel } from "@/features/resources/lib/validation-labels";
import type { ValidationReportOut } from "@/shared/types";

interface ValidationReportViewProps {
  report: ValidationReportOut;
  /** 只显示某个任务 */
  jobId?: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ValidationReportView({ report, jobId }: ValidationReportViewProps) {
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [onlyWarning, setOnlyWarning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const jobs = useMemo(
    () => (jobId ? report.jobs.filter((job) => job.job_id === jobId) : report.jobs),
    [report.jobs, jobId],
  );

  const failedCount = useMemo(
    () =>
      report.jobs.reduce(
        (sum, job) =>
          sum +
          job.checks.filter((check) => check.severity === "error" && !check.passed)
            .length,
        0,
      ),
    [report.jobs],
  );

  const toggle = (jobIdKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(jobIdKey)) next.delete(jobIdKey);
      else next.add(jobIdKey);
      return next;
    });
  };

  if (report.jobs.length === 0) {
    return (
      <div className="rounded-md border border-border bg-bg-surface px-3 py-2 text-xs text-text-tertiary">
        校验报告中没有任务记录。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {failedCount === 0 ? (
          <span className="badge badge-success">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            全部通过
          </span>
        ) : (
          <span className="badge badge-danger">
            <XCircle className="mr-1 h-3 w-3" />
            {failedCount} 项错误
          </span>
        )}
        <span className="text-text-tertiary">
          批次 {report.batch ?? "—"} · 共 {report.batch_size} 只坐骑
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-text-secondary">
          <input
            type="checkbox"
            checked={onlyFailed}
            onChange={(e) => setOnlyFailed(e.target.checked)}
            className="h-3.5 w-3.5 accent-blue-500"
          />
          只看失败
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-text-secondary">
          <input
            type="checkbox"
            checked={onlyWarning}
            onChange={(e) => setOnlyWarning(e.target.checked)}
            className="h-3.5 w-3.5 accent-blue-500"
          />
          只看警告
        </label>
      </div>

      {jobs.map((job) => {
        const isOpen = expanded.has(job.job_id);
        const visibleChecks = job.checks.filter((check) => {
          if (onlyFailed && (check.passed || check.severity !== "error")) {
            return false;
          }
          if (onlyWarning && check.severity !== "warning") return false;
          return true;
        });
        return (
          <div
            key={job.job_id}
            className="overflow-hidden rounded-md border border-border bg-bg-surface"
          >
            <button
              type="button"
              onClick={() => toggle(job.job_id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              )}
              <span className="font-mono text-text-secondary">{job.job_id}</span>
              <span className="text-text-primary">{job.mount_name}</span>
              {job.passed ? (
                <span className="badge badge-success ml-auto">通过</span>
              ) : (
                <span className="badge badge-danger ml-auto">未通过</span>
              )}
            </button>

            {isOpen && (
              <ul className="space-y-1 border-t border-border px-3 py-2">
                {visibleChecks.length === 0 && (
                  <li className="text-xs text-text-tertiary">无匹配的检查项。</li>
                )}
                {visibleChecks.map((check) => (
                  <li key={check.name} className="text-xs">
                    <div className="flex items-start gap-1.5">
                      {check.passed ? (
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                      ) : check.severity === "error" ? (
                        <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-danger" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                      )}
                      <span className="text-text-primary">
                        {getValidationCheckLabel(check.name)}
                      </span>
                      {!check.passed && (
                        <span
                          className={
                            check.severity === "error"
                              ? "badge badge-danger"
                              : "badge badge-warning"
                          }
                        >
                          {check.severity === "error" ? "错误" : "警告"}
                        </span>
                      )}
                    </div>
                    {check.message && (
                      <div className="ml-[18px] text-text-secondary">
                        {check.message}
                      </div>
                    )}
                    {!check.passed && (
                      <div className="ml-[18px] font-mono text-[11px] text-text-tertiary">
                        期望 {formatValue(check.expected)} · 实际{" "}
                        {formatValue(check.actual)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
