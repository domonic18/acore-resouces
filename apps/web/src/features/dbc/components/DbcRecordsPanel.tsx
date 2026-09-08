import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  GitCompare,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { CopyButton } from "@/shared/components/CopyButton";
import { useDbcFiles, useDbcRecords } from "@/features/dbc/hooks/useDbcViewer";
import { DbcColumnConfig } from "@/features/dbc/components/DbcColumnConfig";
import { DbcTableViewer } from "@/features/dbc/components/DbcTableViewer";
import {
  formatBytes,
  loadColumns,
  saveColumns,
} from "@/features/dbc/lib/columns";

const PAGE_SIZE = 20;

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

interface DbcRecordsPanelProps {
  file: string | null;
  selectedRecordId: number | null;
  onSelectRecord: (recordId: number) => void;
  compareMode: boolean;
  compareA: number | null;
  compareB: number | null;
  onToggleCompareMode: () => void;
  onCompareRecord: (recordId: number) => void;
  onOpenCompare: () => void;
  onClearCompare: () => void;
}

export function DbcRecordsPanel({
  file,
  selectedRecordId,
  onSelectRecord,
  compareMode,
  compareA,
  compareB,
  onToggleCompareMode,
  onCompareRecord,
  onOpenCompare,
  onClearCompare,
}: DbcRecordsPanelProps) {
  const [draft, setDraft] = useState<FilterState>({ field: "ID", op: "gt", value: "" });
  const [applied, setApplied] = useState<FilterState | null>(null);
  const [page, setPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  const filesQuery = useDbcFiles();
  const fileInfo = filesQuery.data?.items.find((item) => item.name === file);

  const { data, isLoading, isError, error } = useDbcRecords(file, {
    page,
    page_size: PAGE_SIZE,
    field: applied?.field,
    op: applied?.op,
    value: applied?.value,
  });

  // 切换文件时重置过滤/分页/列配置
  useEffect(() => {
    setDraft({ field: "ID", op: "gt", value: "" });
    setApplied(null);
    setPage(1);
  }, [file]);

  // 字段元数据就绪后加载列配置（含 localStorage 持久化）
  useEffect(() => {
    if (data?.fields?.length) {
      setVisibleColumns(loadColumns(file as string, data.fields));
    }
  }, [file, data?.fields]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const applyFilter = () => {
    if (!draft.value.trim()) {
      setApplied(null);
    } else {
      setApplied({ ...draft, value: draft.value.trim() });
    }
    setPage(1);
  };

  const resetFilter = () => {
    setDraft((prev) => ({ ...prev, value: "" }));
    setApplied(null);
    setPage(1);
  };

  const toggleColumn = (column: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(column)
        ? prev.filter((c) => c !== column)
        : [...prev, column];
      saveColumns(file as string, next);
      return next;
    });
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="min-w-0">
          <div className="card-title flex flex-wrap items-center gap-2">
            <span className="font-mono">{file ?? "未选择文件"}</span>
            {fileInfo && (
              <>
                <span
                  className={cn(
                    "badge",
                    fileInfo.schema_registered ? "badge-green" : "badge-gray",
                  )}
                >
                  {fileInfo.schema_registered ? "schema 已注册" : "schema 未注册"}
                </span>
                {data && (
                  <span className="badge badge-blue">{data.total} 条记录</span>
                )}
              </>
            )}
          </div>
          {file && filesQuery.data?.base_dir && (
            <div className="mt-1.5 flex items-center gap-2">
              <code
                className="min-w-0 flex-1 break-all rounded bg-bg-surface px-2 py-1 font-mono text-[11px] text-text-secondary"
                title="文件磁盘位置"
              >
                {filesQuery.data.base_dir}/{file}
              </code>
              <CopyButton
                value={`${filesQuery.data.base_dir}/${file}`}
                title="复制文件完整路径"
              />
            </div>
          )}
          {fileInfo && (
            <div className="card-subtitle mt-1 flex flex-wrap items-center gap-2">
              {fileInfo.header && (
                <>
                  <span>{fileInfo.header.magic}</span>
                  <span>·</span>
                  <span>{fileInfo.header.field_count} 字段</span>
                  <span>·</span>
                  <span>记录大小 {fileInfo.header.record_size} B</span>
                  <span>·</span>
                  <span>
                    字符串块 {formatBytes(fileInfo.header.string_block_size)}
                  </span>
                  <span>·</span>
                </>
              )}
              <span>{formatBytes(fileInfo.size)}</span>
              <span>·</span>
              <span>{new Date(fileInfo.mtime).toLocaleString()}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {file && (
            <button
              type="button"
              className={cn("btn btn-sm", compareMode && "btn-primary")}
              onClick={onToggleCompareMode}
              title="开启后点击记录行指定对比项 A / B"
            >
              <GitCompare className="h-3.5 w-3.5" /> 对比
            </button>
          )}
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
        {compareMode && file && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-surface px-3 py-2 text-xs">
            {compareA == null && compareB == null ? (
              <span className="text-text-secondary">
                对比模式：点击两条记录分别设为 A / B，选定后自动对比
              </span>
            ) : (
              <>
                <span className="badge badge-blue">A</span>
                <span className="font-mono">
                  {compareA != null ? `#${compareA}` : "—"}
                </span>
                <span className="text-text-tertiary">vs</span>
                <span className="badge badge-blue">B</span>
                <span className="font-mono">
                  {compareB != null ? `#${compareB}` : "—"}
                </span>
                <span className="flex items-center gap-2">
                  {compareA != null && compareB != null && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={onOpenCompare}
                    >
                      <Eye className="h-3.5 w-3.5" /> 查看对比
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={onClearCompare}
                    title="清除已指定的对比项"
                  >
                    <X className="h-3.5 w-3.5" /> 清除
                  </button>
                </span>
              </>
            )}
          </div>
        )}

        {file && (
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
            {applied && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={resetFilter}
                title={`重置过滤：${applied.field} ${applied.op} ${applied.value}`}
              >
                <RotateCcw className="h-3.5 w-3.5" /> 重置
              </button>
            )}
          </div>
        )}

        {isError && (
          <div className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            查询失败：{error instanceof Error ? error.message : "未知错误"}
            （字段不存在或过滤值类型不匹配时可重置过滤）
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-sm text-text-secondary">
            加载中...
          </div>
        ) : !file ? (
          <div className="py-12 text-center text-sm text-text-secondary">
            从左侧选择 DBC 文件查看记录
          </div>
        ) : (
          <DbcTableViewer
            fields={data?.fields ?? []}
            visibleColumns={visibleColumns}
            items={data?.items ?? []}
            annotations={data?.annotations ?? []}
            selectedRecordId={selectedRecordId}
            onSelectRecord={onSelectRecord}
            compareMode={compareMode}
            compareA={compareA}
            compareB={compareB}
            onCompareRecord={onCompareRecord}
          />
        )}

        {data && data.total > 0 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-text-tertiary">
              共 {data.total} 条
              {applied && `（${applied.field} ${applied.op} ${applied.value}）`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setPage(1)}
                disabled={page <= 1}
              >
                <ChevronsLeft className="h-4 w-4" /> 第一页
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" /> 上一页
              </button>
              <span className="text-xs text-text-secondary">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                下一页 <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
              >
                最后一页 <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
