import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/utils";
import { formatBytes } from "@/features/dbc/lib/columns";
import { useDbcFiles } from "@/features/dbc/hooks/useDbcViewer";

interface DbcFileListProps {
  selectedFile: string | null;
  onSelect: (file: string) => void;
}

export function DbcFileList({ selectedFile, onSelect }: DbcFileListProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useDbcFiles();

  const keyword = search.trim().toLowerCase();
  const files = (data?.items ?? []).filter((file) =>
    file.name.toLowerCase().includes(keyword),
  );
  const registeredCount = (data?.items ?? []).filter((f) => f.schema_registered).length;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">DBC 文件</div>
          <div className="card-subtitle font-mono text-[11px]">
            data/wow-dbc/src/dbc
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            className="form-input w-full pl-9"
            placeholder="筛选文件名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mt-3 max-h-[560px] space-y-0.5 overflow-y-auto">
          {isLoading && (
            <div className="py-8 text-center text-sm text-text-secondary">
              加载中...
            </div>
          )}
          {isError && (
            <div className="py-8 text-center text-sm text-danger">
              DBC 文件列表加载失败
            </div>
          )}
          {files.map((file) => (
            <button
              key={file.name}
              type="button"
              onClick={() => onSelect(file.name)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left cursor-pointer",
                selectedFile === file.name
                  ? "bg-accent-soft text-accent"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
              )}
            >
              <span className="truncate font-mono text-xs">{file.name}</span>
              <span className="shrink-0 text-[10px] text-text-tertiary">
                {formatBytes(file.size)}
              </span>
            </button>
          ))}
          {!isLoading && !isError && files.length === 0 && (
            <div className="py-6 text-center text-xs text-text-tertiary">
              无匹配文件
            </div>
          )}
        </div>

        <div className="mt-3 border-t border-border pt-2 text-[11px] text-text-tertiary">
          共 {data?.total ?? 0} 个文件 · {registeredCount} 个已注册 schema
        </div>
      </div>
    </div>
  );
}
