import { useMemo, useState } from "react";
import { Check, Copy, Search, X } from "lucide-react";
import { cn } from "@/shared/utils";
import type { DbcSourceResource } from "@/shared/types";
import { useDbcRecord } from "@/features/dbc/hooks/useDbcViewer";
import {
  computeRecordDiff,
  formatDiffText,
  formatDiffValue,
  type DbcDiffRow,
} from "@/features/dbc/lib/diff";

interface DbcCompareDialogProps {
  file: string;
  recordAId: number;
  recordBId: number;
  onClose: () => void;
}

type FilterMode = "diff" | "all";

function resourceLabel(resources: DbcSourceResource[]): string | null {
  const first = resources[0];
  if (!first) return null;
  return first.name || first.model_folder;
}

/** 记录 Diff 对比弹窗：字段 | 类型 | A | B，差异行高亮，仅差异/全部过滤 + 字段搜索 */
export function DbcCompareDialog({
  file,
  recordAId,
  recordBId,
  onClose,
}: DbcCompareDialogProps) {
  const [mode, setMode] = useState<FilterMode>("diff");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const queryA = useDbcRecord(file, recordAId);
  const queryB = useDbcRecord(file, recordBId);
  const loading = queryA.isLoading || queryB.isLoading;
  const failed = queryA.isError || queryB.isError;

  const rows: DbcDiffRow[] = useMemo(() => {
    if (!queryA.data || !queryB.data) return [];
    return computeRecordDiff(queryA.data, queryB.data);
  }, [queryA.data, queryB.data]);

  const diffCount = rows.filter((r) => !r.same).length;

  const keyword = search.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = mode === "diff" ? rows.filter((r) => !r.same) : rows;
    if (keyword) {
      list = list.filter(
        (row) =>
          row.name.toLowerCase().includes(keyword) ||
          formatDiffValue(row.a).toLowerCase().includes(keyword) ||
          formatDiffValue(row.b).toLowerCase().includes(keyword),
      );
    }
    return list;
  }, [rows, mode, keyword]);

  const copyText = () => {
    const text = formatDiffText({
      file,
      recordAId,
      recordBId,
      labelA: queryA.data ? resourceLabel(queryA.data.resources) : null,
      labelB: queryB.data ? resourceLabel(queryB.data.resources) : null,
      totalFields: rows.length,
      diffCount,
      visibleRows: visible,
      scopeLabel:
        mode === "diff"
          ? `仅差异${keyword ? `（搜索 "${keyword}"）` : ""}`
          : `全部${keyword ? `（搜索 "${keyword}"）` : ""}`,
    });
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  };

  const renderSideHeader = (
    label: "A" | "B",
    recordId: number,
    resources: DbcSourceResource[] | undefined,
  ) => {
    const name = resources ? resourceLabel(resources) : null;
    return (
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="badge badge-blue shrink-0">{label}</span>
        <span className="font-mono text-sm">#{recordId}</span>
        {name && (
          <span className="truncate text-xs text-text-tertiary">{name}</span>
        )}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-lg border border-border bg-bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-text-primary">
              记录对比 · <span className="font-mono">{file}</span>
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              {renderSideHeader("A", recordAId, queryA.data?.resources)}
              <span className="text-xs text-text-tertiary">vs</span>
              {renderSideHeader("B", recordBId, queryB.data?.resources)}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={onClose}
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="py-12 text-center text-sm text-text-secondary">
            加载记录中...
          </div>
        )}
        {failed && (
          <div className="py-12 text-center text-sm text-danger">
            记录详情加载失败
          </div>
        )}

        {!loading && !failed && (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="text-xs text-text-secondary">
                {rows.length} 字段 ·{" "}
                <span className="font-medium text-accent">
                  {diffCount} 处不同
                </span>{" "}
                · {rows.length - diffCount} 相同
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={copyText}
                  title="复制当前视图的对比内容为纯文本（供 AI 分析）"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "已复制" : "复制"}
                </button>
                <button
                  type="button"
                  className={cn("btn btn-sm", mode === "diff" && "btn-primary")}
                  onClick={() => setMode("diff")}
                >
                  仅差异 {diffCount}
                </button>
                <button
                  type="button"
                  className={cn("btn btn-sm", mode === "all" && "btn-primary")}
                  onClick={() => setMode("all")}
                >
                  全部 {rows.length}
                </button>
                <div className="relative ml-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    className="form-input-compact w-44 pl-8"
                    placeholder="搜索字段 / 值..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="overflow-y-auto px-4 pb-4">
              {diffCount === 0 ? (
                <div className="py-10 text-center text-sm text-text-secondary">
                  两条记录完全相同
                </div>
              ) : (
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th className="w-56">字段</th>
                      <th className="w-20">类型</th>
                      <th>记录 A</th>
                      <th>记录 B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.name} className={cn(!row.same && "bg-accent-soft")}>
                        <td className="font-mono text-xs" title={row.name}>
                          {row.name}
                        </td>
                        <td className="text-xs text-text-tertiary">
                          {row.type}
                        </td>
                        <td
                          className={cn(
                            "max-w-64 truncate font-mono text-xs",
                            !row.same ? "text-accent" : "text-text-secondary",
                          )}
                          title={formatDiffValue(row.a)}
                        >
                          {formatDiffValue(row.a)}
                        </td>
                        <td
                          className={cn(
                            "max-w-64 truncate font-mono text-xs",
                            !row.same ? "text-accent" : "text-text-secondary",
                          )}
                          title={formatDiffValue(row.b)}
                        >
                          {formatDiffValue(row.b)}
                        </td>
                      </tr>
                    ))}
                    {visible.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-8 text-center text-xs text-text-tertiary"
                        >
                          无匹配字段
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
