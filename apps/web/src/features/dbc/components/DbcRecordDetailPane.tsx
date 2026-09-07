import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { cn } from "@/shared/utils";
import { useDbcRecord } from "@/features/dbc/hooks/useDbcViewer";

const GROUP_SIZE = 25;

interface DbcRecordDetailPaneProps {
  file: string | null;
  recordId: number | null;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

/** 记录详情面板：全字段（25 个/组可折叠）+ 字段内搜索 + 来源资源徽章 */
export function DbcRecordDetailPane({ file, recordId }: DbcRecordDetailPaneProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useDbcRecord(file, recordId);

  const keyword = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!keyword) return data.fields;
    return data.fields.filter(
      (field) =>
        field.name.toLowerCase().includes(keyword) ||
        formatValue(field.value).toLowerCase().includes(keyword),
    );
  }, [data, keyword]);

  const groups = useMemo(() => {
    const chunks: { label: string; fields: typeof filtered }[] = [];
    for (let i = 0; i < filtered.length; i += GROUP_SIZE) {
      const chunk = filtered.slice(i, i + GROUP_SIZE);
      chunks.push({
        label: `字段 ${i + 1}–${i + chunk.length}`,
        fields: chunk,
      });
    }
    return chunks;
  }, [filtered]);

  if (!file || recordId === null) {
    return (
      <div className="card">
        <div className="card-body py-12 text-center text-sm text-text-secondary">
          点击记录行查看全字段详情
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="min-w-0">
          <div className="card-title flex flex-wrap items-center gap-2">
            记录 <span className="font-mono">#{recordId}</span>
            <span className="badge badge-gray">只读</span>
          </div>
          {data && (
            <div className="card-subtitle mt-1">
              第 {data.index} 行 · {data.fields.length} 个字段
            </div>
          )}
        </div>
      </div>

      {data && data.resources.length > 0 && (
        <div className="px-5 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {data.resources.map((resource) => (
              <Link
                key={`${resource.type}-${resource.id}`}
                to={`/resources/${resource.type}/${resource.id}`}
                className="badge badge-purple"
              >
                {String(resource.id).padStart(4, "0")} ·{" "}
                {resource.name || resource.model_folder} →
              </Link>
            ))}
          </div>
        </div>
      )}

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
          <div className="py-10 text-center text-sm text-text-secondary">
            加载中...
          </div>
        )}
        {isError && (
          <div className="py-10 text-center text-sm text-danger">
            记录详情加载失败
          </div>
        )}

        {data && (
          <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto">
            {groups.map((group, gi) => (
              <details key={group.label} open={gi === 0}>
                <summary className="cursor-pointer select-none rounded px-1 py-1 text-xs font-semibold text-text-secondary hover:text-text-primary">
                  {group.label}
                </summary>
                <div className="mt-1 space-y-px">
                  {group.fields.map((field) => (
                    <div
                      key={field.name}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded px-2 py-1.5",
                        "odd:bg-white/[0.02]",
                      )}
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
            {filtered.length === 0 && (
              <div className="py-6 text-center text-xs text-text-tertiary">
                无匹配字段
              </div>
            )}
          </div>
        )}

        <div className="mt-3 border-t border-border pt-2 text-[10px] leading-4 text-text-tertiary">
          字段名与类型来自 wow-dbc-tool schema（{file.replace(".dbc", "")}
          .json），分组仅为显示用途，顺序与文件一致。数据修改请经资源编辑 +
          补丁构建流程。
        </div>
      </div>
    </div>
  );
}
