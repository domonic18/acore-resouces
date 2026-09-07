import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  File as FileIcon,
  Folder,
  Image,
  Search,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { CopyButton } from "@/shared/components/CopyButton";
import { formatBytes } from "@/features/dbc/lib/columns";
import { useMpqArchives, useMpqFiles } from "@/features/mpq/hooks/useMpqViewer";
import type { MpqFileEntry } from "@/shared/types";

function entryIcon(entry: MpqFileEntry) {
  if (entry.type === "dir") {
    return <Folder className="h-3.5 w-3.5 shrink-0 text-accent" />;
  }
  if (entry.path.toLowerCase().endsWith(".dbc")) {
    return <Database className="h-3.5 w-3.5 shrink-0 text-text-secondary" />;
  }
  if (entry.path.toLowerCase().endsWith(".blp")) {
    return <Image className="h-3.5 w-3.5 shrink-0 text-text-secondary" />;
  }
  return <FileIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />;
}

interface MpqFileTreeProps {
  archive: string | null;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

/** 档案文件树：搜索框（扁平匹配）+ 懒加载层级目录（按前缀逐级请求）。 */
export function MpqFileTree({
  archive,
  selectedPath,
  onSelectFile,
}: MpqFileTreeProps) {
  const [search, setSearch] = useState("");
  const trimmed = search.trim();
  const archivesQuery = useMpqArchives();
  const absPath = archivesQuery.data?.items.find(
    (item) => item.rel_path === archive,
  )?.abs_path;

  return (
    <div className="card">
      <div className="card-header">
        <div className="min-w-0">
          <div className="card-title">档案内容</div>
          <div className="card-subtitle mt-1 font-mono text-[11px] break-all">
            {archive ?? "未选择档案"}
          </div>
          {absPath && (
            <div className="mt-1.5 flex items-center gap-2">
              <code
                className="min-w-0 flex-1 break-all rounded bg-bg-surface px-2 py-1 font-mono text-[11px] text-text-secondary"
                title="档案磁盘位置"
              >
                {absPath}
              </code>
              <CopyButton value={absPath} title="复制档案完整路径" />
            </div>
          )}
        </div>
      </div>
      <div className="card-body">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            className="form-input w-full pl-9"
            placeholder="搜索档案内路径..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mt-3">
          {!archive ? (
            <div className="py-10 text-center text-sm text-text-secondary">
              从左侧选择 MPQ 档案
            </div>
          ) : trimmed ? (
            <SearchResults archive={archive} search={trimmed} onSelectFile={onSelectFile} />
          ) : (
            <TreeLevel
              archive={archive}
              prefix=""
              depth={0}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SearchResults({
  archive,
  search,
  onSelectFile,
}: {
  archive: string;
  search: string;
  onSelectFile: (path: string) => void;
}) {
  const { data, isLoading, isError, error } = useMpqFiles(archive, {
    search,
  });

  if (isLoading) {
    return (
      <div className="py-8 text-center text-sm text-text-secondary">加载中...</div>
    );
  }
  if (isError) {
    return (
      <div className="py-8 text-center text-xs text-danger">
        {error instanceof Error ? error.message : "搜索失败"}
      </div>
    );
  }
  return (
    <div className="max-h-[520px] space-y-0.5 overflow-y-auto">
      {(data?.entries ?? []).map((entry) => (
        <button
          key={entry.path}
          type="button"
          onClick={() => onSelectFile(entry.path)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary cursor-pointer"
          title={entry.path}
        >
          {entryIcon(entry)}
          <span className="min-w-0 flex-1 truncate">{entry.path}</span>
        </button>
      ))}
      {data?.entries?.length === 0 && (
        <div className="py-6 text-center text-xs text-text-tertiary">
          无匹配路径
        </div>
      )}
      {data?.truncated && (
        <div className="pt-2 text-center text-[10px] text-text-tertiary">
          结果超过 200 条，仅显示前 200 条，请细化搜索词
        </div>
      )}
    </div>
  );
}

function TreeLevel({
  archive,
  prefix,
  depth,
  selectedPath,
  onSelectFile,
}: {
  archive: string;
  prefix: string;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const { data, isLoading, isError, error } = useMpqFiles(archive, {
    prefix,
  });

  if (isLoading) {
    return (
      <div className="py-4 text-center text-xs text-text-secondary">加载中...</div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
        {error instanceof Error ? error.message : "档案内容加载失败"}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {depth === 0 && data && (
        <SourceBanner source={data.source} obfuscation={data.obfuscation} />
      )}
      {(data?.entries ?? []).map((entry) =>
        entry.type === "dir" ? (
          <DirNode
            key={entry.path}
            archive={archive}
            entry={entry}
            depth={depth}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
          />
        ) : (
          <button
            key={entry.path}
            type="button"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            onClick={() => onSelectFile(entry.path)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left font-mono text-xs cursor-pointer",
              selectedPath === entry.path
                ? "bg-accent-soft text-accent"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
            )}
            title={entry.path}
          >
            {entryIcon(entry)}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {entry.size != null && (
              <span className="shrink-0 text-[10px] text-text-tertiary">
                {formatBytes(entry.size)}
              </span>
            )}
          </button>
        ),
      )}
      {depth === 0 && data?.entries?.length === 0 && (
        <div className="py-6 text-center text-xs text-text-tertiary">
          档案内容为空
        </div>
      )}
    </div>
  );
}

function DirNode({
  archive,
  entry,
  depth,
  selectedPath,
  onSelectFile,
}: {
  archive: string;
  entry: MpqFileEntry;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left font-mono text-xs text-text-primary hover:bg-bg-hover cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-text-tertiary" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary" />
        )}
        {entryIcon(entry)}
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        <span className="shrink-0 text-[10px] text-text-tertiary">
          {entry.file_count ?? 0}
        </span>
      </button>
      {expanded && (
        <TreeLevel
          archive={archive}
          prefix={entry.path}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      )}
    </div>
  );
}

function SourceBanner({
  source,
  obfuscation,
}: {
  source: string;
  obfuscation: string | null;
}) {
  if (source === "manifest") {
    return (
      <div className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[10px] leading-4 text-warning">
        清单来源：manifest.json
        {obfuscation && obfuscation !== "none" && `（${obfuscation} 混淆档案按构建清单枚举）`}
      </div>
    );
  }
  if (source === "listfile") {
    return (
      <div className="mb-2 rounded-md border border-border bg-bg-surface px-2.5 py-1.5 text-[10px] leading-4 text-text-secondary">
        清单来源：批次 listfile.txt
      </div>
    );
  }
  return null;
}
