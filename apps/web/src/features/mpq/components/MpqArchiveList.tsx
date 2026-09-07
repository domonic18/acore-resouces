import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/utils";
import { formatBytes } from "@/features/dbc/lib/columns";
import { useMpqArchives } from "@/features/mpq/hooks/useMpqViewer";
import type { MpqArchiveItem } from "@/shared/types";

const OBFUSCATION_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  none: { label: "none", className: "badge-gray" },
  basic: { label: "basic", className: "badge-orange" },
  encrypted: { label: "encrypted", className: "badge-danger" },
};

function ObfuscationBadge({ level }: { level: string | null }) {
  if (!level) {
    return (
      <span className="badge badge-gray" title="无构建清单，混淆等级未知">
        未知混淆
      </span>
    );
  }
  const conf = OBFUSCATION_BADGES[level] ?? {
    label: level,
    className: "badge-gray",
  };
  return (
    <span className={`badge ${conf.className}`}>{conf.label} 混淆</span>
  );
}

interface MpqArchiveListProps {
  selected: string | null;
  onSelect: (relPath: string) => void;
}

export function MpqArchiveList({ selected, onSelect }: MpqArchiveListProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useMpqArchives();

  const keyword = search.trim().toLowerCase();
  const items = (data?.items ?? []).filter(
    (item) =>
      !keyword ||
      item.name.toLowerCase().includes(keyword) ||
      item.batch.toLowerCase().includes(keyword),
  );

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">MPQ 档案</div>
          <div className="card-subtitle font-mono text-[11px]">
            workspace/mpq · workspace/dist
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            className="form-input w-full pl-9"
            placeholder="筛选档案 / 批次..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mt-3 max-h-[560px] space-y-1.5 overflow-y-auto">
          {isLoading && (
            <div className="py-8 text-center text-sm text-text-secondary">
              加载中...
            </div>
          )}
          {isError && (
            <div className="py-8 text-center text-sm text-danger">
              档案列表加载失败
            </div>
          )}
          {items.map((item: MpqArchiveItem) => (
            <button
              key={item.rel_path}
              type="button"
              onClick={() => onSelect(item.rel_path)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left cursor-pointer",
                selected === item.rel_path
                  ? "border-accent/40 bg-accent-soft"
                  : "border-transparent bg-bg-surface hover:bg-bg-hover",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-text-primary">
                  {item.name}
                </span>
                <span className="shrink-0 text-[10px] text-text-tertiary">
                  {formatBytes(item.size)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <ObfuscationBadge level={item.obfuscation} />
                {item.published && (
                  <span className="badge badge-green">已发布</span>
                )}
                <span className="badge badge-gray">
                  {item.source === "dist" ? "dist" : "构建产物"}
                </span>
                {item.file_count != null && (
                  <span className="text-[10px] text-text-tertiary">
                    {item.file_count} 文件
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-[10px] text-text-tertiary">
                批次 {item.batch} ·{" "}
                {new Date(item.mtime).toLocaleString()}
              </div>
            </button>
          ))}
          {!isLoading && !isError && items.length === 0 && (
            <div className="py-6 text-center text-xs text-text-tertiary">
              无匹配档案
            </div>
          )}
        </div>

        <div className="mt-3 border-t border-border pt-2 text-[11px] text-text-tertiary">
          共 {data?.total ?? 0} 个档案 · 混淆等级来自构建 manifest.json
        </div>
      </div>
    </div>
  );
}
