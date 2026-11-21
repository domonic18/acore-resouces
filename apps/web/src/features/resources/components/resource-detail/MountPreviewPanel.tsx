import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { usePatchPreview } from "@/features/resources/hooks/usePatchFlow";
import { getRelationshipCheckLabel } from "@/features/resources/lib/validation-labels";
import type { MountPatchPreview } from "@/shared/types";

interface MountPreviewPanelProps {
  resourceId: number;
}

/**
 * 补丁预检面板（所见即所得）。
 *
 * 展示「这次构建会往 DBC/SQL 写入什么」以及全部问题——
 * 对应生产流程的第 5 步，发生在创建补丁任务之前。
 */
export function MountPreviewPanel({ resourceId }: MountPreviewPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = usePatchPreview(resourceId);

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在计算补丁预览...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
        预览失败：
        {query.error instanceof Error ? query.error.message : "未知错误"}
      </div>
    );
  }

  const preview = query.data as MountPatchPreview | undefined;
  if (!preview) return null;

  const errors = preview.issues.filter((issue) => issue.severity === "error");
  const warnings = preview.issues.filter((issue) => issue.severity === "warning");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {preview.ready ? (
          <span className="badge badge-success">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            预检通过
          </span>
        ) : (
          <span className="badge badge-danger">
            <XCircle className="mr-1 h-3 w-3" />
            {errors.length} 个错误
          </span>
        )}
        {warnings.length > 0 && (
          <span className="badge badge-warning">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {warnings.length} 个警告
          </span>
        )}
        <span className="text-text-tertiary">
          将写入 {preview.dbc_plan.plans.length} 个 DBC 文件 ·{" "}
          {preview.sql_plan.tables.length} 张 SQL 表
        </span>
        <button
          type="button"
          className="btn btn-icon btn-sm btn-ghost ml-auto"
          onClick={() => query.refetch()}
          title="重新计算预览"
          aria-label="重新计算预览"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {preview.issues.length > 0 && (
        <ul className="space-y-1">
          {preview.issues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`} className="flex gap-1.5 text-xs">
              {issue.severity === "error" ? (
                <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-danger" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
              )}
              <span className="text-text-secondary">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1">
        <div className="text-xs font-semibold text-text-secondary">
          DBC 写入计划
        </div>
        {preview.dbc_plan.plans.map((planFile) => (
          <div
            key={planFile.dbc_file}
            className="overflow-hidden rounded-md border border-border bg-bg-surface"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
              onClick={() =>
                setExpanded((prev) =>
                  prev === planFile.dbc_file ? null : planFile.dbc_file,
                )
              }
            >
              {expanded === planFile.dbc_file ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              )}
              <span className="font-mono text-text-primary">
                {planFile.dbc_file}
              </span>
              <span className="ml-auto text-text-tertiary">
                {planFile.operations.length} 条记录
              </span>
            </button>
            {expanded === planFile.dbc_file && (
              <ul className="space-y-2 border-t border-border px-3 py-2">
                {planFile.operations.map((op) => (
                  <li key={`${op.record_id}-${op.reason}`} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-text-primary">
                        #{op.record_id}
                      </span>
                      <span className="badge badge-gray">{op.action}</span>
                      <span className="text-text-secondary">{op.reason}</span>
                    </div>
                    <dl className="mt-1 grid grid-cols-[minmax(0,10rem)_1fr] gap-x-2 font-mono text-[11px] text-text-tertiary">
                      {Object.entries(op.fields).map(([key, value]) => (
                        <div key={key} className="contents">
                          <dt className="truncate">{key}</dt>
                          <dd className="truncate text-text-secondary">
                            {value === null || value === undefined
                              ? "—"
                              : typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold text-text-secondary">
          关联校验
        </div>
        <ul className="space-y-1">
          {preview.relationships.map((check) => (
            <li key={check.rule.key} className="flex items-start gap-1.5 text-xs">
              {check.status === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
              ) : (
                <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
              )}
              <span className="text-text-primary">
                {getRelationshipCheckLabel(check.rule.key)}
              </span>
              <span className="text-text-tertiary">{check.rule.description}</span>
            </li>
          ))}
        </ul>
      </div>

      {preview.sql_plan.tables.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-text-secondary">
            SQL 写入计划
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {preview.sql_plan.tables.map((table) => (
              <li key={table.name} className="badge badge-gray">
                {table.name} × {table.records.length}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
