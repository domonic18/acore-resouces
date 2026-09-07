import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/utils";
import {
  useMpqDbcRecord,
  useMpqDbcRecords,
} from "@/features/mpq/hooks/useMpqViewer";
import { DbcColumnConfig } from "@/features/dbc/components/DbcColumnConfig";
import {
  loadColumns,
  saveColumns,
} from "@/features/dbc/lib/columns";
import type { DbcRecordRow } from "@/shared/types";

const PAGE_SIZE = 20;
const GROUP_SIZE = 25;

const OP_OPTIONS = [
  { value: "contains", label: "包含" },
  { value: "eq", label: "等于" },
  { value: "gt", label: "大于" },
  { value: "lt", label: "小于" },
];

interface FilterState {
  field: string;
  op: string;
  value: string;
}

interface MpqDbcViewerProps {
  archive: string;
  path: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

/** MPQ 档案内 DBC 文件的记录查看：过滤 + 分页 + 列配置 + 内嵌全字段详情。 */
export function MpqDbcViewer({ archive, path }: MpqDbcViewerProps) {
  const storageKey = `mpq-dbc-cols:${archive}:${path}`;
  const [draft, setDraft] = useState<FilterState>({ field: "ID", op: "gt", value: "" });
  const [applied, setApplied] = useState<FilterState | null>(null);
  const [page, setPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [recordId, setRecordId] = useState<number | null>(null);

  const { data, isLoading, isError, error } = useMpqDbcRecords(archive, path, {
    page,
    page_size: PAGE_SIZE,
    field: applied?.field,
    op: applied?.op,
    value: applied?.value,
  });

  useEffect(() => {
    setDraft({ field: "ID", op: "gt", value: "" });
    setApplied(null);
    setPage(1);
    setRecordId(null);
  }, [archive, path]);

  useEffect(() => {
    if (data?.fields?.length) {
      setVisibleColumns(loadColumns(path, data.fields, storageKey));
    }
  }, [path, data?.fields, storageKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const applyFilter = () => {
    if (!draft.value.trim()) {
      setApplied(null);
    } else {
      setApplied({ ...draft, value: draft.value.trim() });
    }
    setPage(1);
  };

  const toggleColumn = (column: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(column)
        ? prev.filter((c) => c !== column)
        : [...prev, column];
      saveColumns(path, next, storageKey);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <div className="min-w-0">
            <div className="card-title flex flex-wrap items-center gap-2">
              <span className="font-mono">{path}</span>
              <span className="badge badge-blue">DBC 记录</span>
              {data && <span className="badge badge-gray">{data.total} 条记录</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data?.fields?.length ? (
              <DbcColumnConfig
                fields={data.fields}
                visibleColumns={visibleColumns}
                onToggle={toggleColumn}
              />
            ) : null}
          </div>
        </div>

        <div className="card-body">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <select
              className="form-select-compact max-w-48 font-mono text-xs"
              value={draft.field}
              onChange={(e) => setDraft({ ...draft, field: e.target.value })}
            >
              {(data?.fields ?? []).map((field) => (
                <option key={field.name} value={field.name}>
                  {field.name}
                </option>
              ))}
            </select>
            <select
              className="form-select-compact"
              value={draft.op}
              onChange={(e) => setDraft({ ...draft, op: e.target.value })}
            >
              {OP_OPTIONS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="form-input-compact w-40"
              placeholder="过滤值（按字段类型）"
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
            />
            <button type="button" className="btn btn-sm" onClick={applyFilter}>
              <Search className="h-3.5 w-3.5" /> 搜索
            </button>
          </div>

          {isError && (
            <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              查询失败：{error instanceof Error ? error.message : "未知错误"}
            </div>
          )}

          {isLoading ? (
            <div className="py-8 text-center text-sm text-text-secondary">
              加载中...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.items ?? []).map((record: DbcRecordRow) => (
                    <tr
                      key={`${record._record_id}-${record._index}`}
                      className={cn(
                        "cursor-pointer",
                        recordId === record._record_id && "bg-accent-soft",
                      )}
                      onClick={() =>
                        setRecordId((prev) =>
                          prev === record._record_id ? null : record._record_id,
                        )
                      }
                    >
                      {visibleColumns.map((column) => (
                        <td
                          key={column}
                          className={cn(
                            "max-w-48 truncate text-xs",
                            column === "ID" && "font-mono text-text-primary",
                          )}
                          title={formatValue(record[column])}
                        >
                          {formatValue(record[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {(data?.items ?? []).length === 0 && (
                    <tr>
                      <td
                        colSpan={Math.max(1, visibleColumns.length)}
                        className="py-8 text-center text-text-secondary"
                      >
                        无匹配记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-text-tertiary">
                共 {data.total} 条 · 第 {page} / {totalPages} 页
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                >
                  第一页
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  下一页
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                >
                  最后一页
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {recordId !== null && (
        <RecordDetailCard
          archive={archive}
          path={path}
          recordId={recordId}
        />
      )}
    </div>
  );
}

function RecordDetailCard({
  archive,
  path,
  recordId,
}: {
  archive: string;
  path: string;
  recordId: number;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useMpqDbcRecord(archive, path, recordId);

  const keyword = search.trim().toLowerCase();
  const fields = (data?.fields ?? []).filter(
    (field) =>
      !keyword ||
      field.name.toLowerCase().includes(keyword) ||
      formatValue(field.value).toLowerCase().includes(keyword),
  );
  const groups: typeof fields[] = [];
  for (let i = 0; i < fields.length; i += GROUP_SIZE) {
    groups.push(fields.slice(i, i + GROUP_SIZE));
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="min-w-0">
          <div className="card-title flex flex-wrap items-center gap-2">
            记录 <span className="font-mono">#{recordId}</span>
            {data && (
              <span className="badge badge-gray">
                第 {data.index} 行 · {data.fields.length} 个字段
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            className="form-input w-full pl-9"
            placeholder="搜索字段名 / 值..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading && (
          <div className="py-8 text-center text-sm text-text-secondary">
            加载中...
          </div>
        )}
        {isError && (
          <div className="py-8 text-center text-sm text-danger">
            记录详情加载失败
          </div>
        )}

        {data && (
          <div className="mt-3 max-h-[480px] space-y-2 overflow-y-auto">
            {groups.map((group, gi) => (
              <details key={gi} open={gi === 0}>
                <summary className="cursor-pointer select-none rounded px-1 py-1 text-xs font-semibold text-text-secondary hover:text-text-primary">
                  字段 {gi * GROUP_SIZE + 1}–{gi * GROUP_SIZE + group.length}
                </summary>
                <div className="mt-1 space-y-px">
                  {group.map((field) => (
                    <div
                      key={field.name}
                      className="flex items-start justify-between gap-3 rounded px-2 py-1.5 odd:bg-white/[0.02]"
                    >
                      <span className="min-w-0 shrink-0 font-mono text-xs text-text-primary">
                        {field.name}
                        <span className="ml-1.5 text-[10px] font-normal text-text-tertiary">
                          {field.type}
                        </span>
                      </span>
                      <span
                        className="min-w-0 break-all text-right font-mono text-xs text-text-secondary"
                        title={formatValue(field.value)}
                      >
                        {formatValue(field.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            {fields.length === 0 && (
              <div className="py-6 text-center text-xs text-text-tertiary">
                无匹配字段
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
