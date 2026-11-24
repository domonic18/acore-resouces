import { useState } from "react";
import { EyeOff, FileText, Search, Trash2 } from "lucide-react";
import { cn } from "@/shared/utils";
import { formatBytes } from "@/shared/format";
import { useMpqArchives } from "@/features/mpq/hooks/useMpqViewer";
import { useDeleteMpqArchive } from "@/features/mpq/hooks/useDeleteMpqArchive";
import { useObfuscateMpqArchive } from "@/features/mpq/hooks/useObfuscateMpqArchive";
import { DeleteArchiveDialog } from "@/features/mpq/components/DeleteArchiveDialog";
import { ObfuscateArchiveDialog } from "@/features/mpq/components/ObfuscateArchiveDialog";
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
  onViewChangelog: (item: MpqArchiveItem) => void;
}

/** 混淆不可用时的原因；null 表示可混淆 */
function obfuscateGateReason(item: MpqArchiveItem): string | null {
  if (item.source === "dist" || item.published) {
    return "已上架的补丁不能直接混淆：请重新构建批次（构建时勾选混淆）并发布新补丁，再下架旧批次";
  }
  if (item.obfuscation === "basic") {
    return "该档案已是混淆状态，无需重复混淆";
  }
  if (!item.has_manifest) {
    return "该档案缺少构建清单（manifest.json），无法混淆；请重新构建批次";
  }
  return null;
}

export function MpqArchiveList({
  selected,
  onSelect,
  onViewChangelog,
}: MpqArchiveListProps) {
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MpqArchiveItem | null>(null);
  const [pendingObfuscate, setPendingObfuscate] = useState<MpqArchiveItem | null>(null);
  const { data, isLoading, isError } = useMpqArchives();
  const deleteMutation = useDeleteMpqArchive();
  const obfuscateMutation = useObfuscateMpqArchive();

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
            workspace/mpq · workspace/dist（dist 下带补丁号的批次已上架「补丁下载」页）
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
            <div
              key={item.rel_path}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.rel_path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(item.rel_path);
              }}
              className={cn(
                "w-full cursor-pointer rounded-md border px-3 py-2 text-left",
                selected === item.rel_path
                  ? "border-accent/40 bg-accent-soft"
                  : "border-transparent bg-bg-surface hover:bg-bg-hover",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-text-primary">
                  {item.name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-[10px] text-text-tertiary">
                    {formatBytes(item.size)}
                  </span>
                  {(() => {
                    const gate = obfuscateGateReason(item);
                    return (
                      <button
                        type="button"
                        className="btn btn-sm px-1.5 py-0.5"
                        disabled={gate !== null}
                        title={
                          gate ??
                          "混淆该档案（剥除内容清单，防第三方枚举；游戏加载不受影响）"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingObfuscate(item);
                        }}
                      >
                        <EyeOff className="h-3 w-3" />
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    className="btn btn-sm px-1.5 py-0.5"
                    disabled={!item.has_changelog}
                    title={
                      item.has_changelog
                        ? "查看该批次的补丁变更日志"
                        : "该批次没有 changelog.md（旧批次或未生成）"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewChangelog(item);
                    }}
                  >
                    <FileText className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm px-1.5 py-0.5 text-danger hover:text-danger"
                    title="删除该补丁文件（批次元数据保留）"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(item);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <ObfuscationBadge level={item.obfuscation} />
                {item.published && (
                  <span className="badge badge-success">已上架</span>
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
            </div>
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

      {pendingDelete && (
        <DeleteArchiveDialog
          archive={pendingDelete}
          mutation={deleteMutation}
          onClose={() => setPendingDelete(null)}
        />
      )}

      {pendingObfuscate && (
        <ObfuscateArchiveDialog
          archive={pendingObfuscate}
          mutation={obfuscateMutation}
          onClose={() => setPendingObfuscate(null)}
        />
      )}
    </div>
  );
}
