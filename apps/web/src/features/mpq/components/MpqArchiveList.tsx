import { useState } from "react";
import { FileText, Search, Trash2 } from "lucide-react";
import { cn } from "@/shared/utils";
import { formatBytes } from "@/features/dbc/lib/columns";
import { useMpqArchives } from "@/features/mpq/hooks/useMpqViewer";
import { useDeleteMpqArchive } from "@/features/mpq/hooks/useDeleteMpqArchive";
import {
  useDistroAdminBatches,
  useDistroBatchDelete,
  useDistroStatus,
} from "@/features/resources/hooks/useDistroPush";
import { DeleteArchiveDialog } from "@/features/mpq/components/DeleteArchiveDialog";
import { DeleteDistroBatchDialog } from "@/features/mpq/components/DeleteDistroBatchDialog";
import type {
  DistroAdminBatchInfo,
  DistroBatchInfo,
  MpqArchiveItem,
} from "@/shared/types";

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

interface DistroBatchSectionProps {
  batches: DistroAdminBatchInfo[];
  localBatches: Set<string>;
  onDelete: (batch: DistroAdminBatchInfo) => void;
}

/**
 * 分发端批次清单。
 *
 * 推送成功后本地 MPQ 会被清理（分发端才是玩家下载的来源），
 * 这类补丁在本地档案列表里看不到，但玩家仍能下载到——不能让它悄悄消失，
 * 也必须能从这里下线，否则本地与分发端的状态会漂移。
 */
function DistroBatchSection({
  batches,
  localBatches,
  onDelete,
}: DistroBatchSectionProps) {
  if (batches.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-border pt-2">
      <div className="mb-1.5 text-[11px] font-medium text-text-secondary">
        分发端批次（玩家下载的来源）
      </div>
      <ul className="space-y-1.5">
        {batches.map((item) => {
          const remoteOnly = !localBatches.has(item.batch);
          const visible = item.status === "complete";
          return (
            <li
              key={item.batch}
              className="rounded-md border border-border bg-bg-surface px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-text-primary">
                  补丁 #{item.patch_number ?? "?"}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-[10px] text-text-tertiary">
                    {item.mpq_bytes ? formatBytes(item.mpq_bytes) : ""}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm px-1.5 py-0.5 text-danger hover:text-danger"
                    title="从分发端删除该批次（玩家将不再能下载）"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </div>
              <div className="mt-1 truncate text-[10px] text-text-tertiary">
                批次 {item.batch}
                {item.mount_count ? ` · ${item.mount_count} 只坐骑` : ""}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {visible ? (
                  <span className="badge badge-blue">玩家可下载</span>
                ) : (
                  <span className="badge badge-gray">
                    不可见（{item.status}）
                  </span>
                )}
                <span
                  className={cn(
                    "badge",
                    remoteOnly ? "badge-orange" : "badge-gray",
                  )}
                >
                  {remoteOnly ? "本地副本已清理" : "本地仍有副本"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[10px] text-text-tertiary">
        推送成功后本地不再保留副本（分发端是玩家下载的来源）
      </p>
    </div>
  );
}

interface MpqArchiveListProps {
  selected: string | null;
  onSelect: (relPath: string) => void;
  onViewChangelog: (item: MpqArchiveItem) => void;
}

export function MpqArchiveList({
  selected,
  onSelect,
  onViewChangelog,
}: MpqArchiveListProps) {
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MpqArchiveItem | null>(null);
  const [pendingDistroDelete, setPendingDistroDelete] =
    useState<DistroAdminBatchInfo | null>(null);
  const [alsoDeleteDistro, setAlsoDeleteDistro] = useState(false);
  const { data, isLoading, isError } = useMpqArchives();
  const distroStatus = useDistroStatus();
  const distroAdmin = useDistroAdminBatches();
  const deleteMutation = useDeleteMpqArchive();
  const distroDeleteMutation = useDistroBatchDelete();

  const pushedBatches = new Set(distroStatus.data?.pushed_batches ?? []);
  const localBatches = new Set(distroStatus.data?.local_batches ?? []);

  // 分发端批次清单：优先用 admin 视角（含 pending 残留），
  // 分发端版本过旧没有管理接口时退回公开 tree。
  const distroBatches: DistroAdminBatchInfo[] =
    distroAdmin.data && distroAdmin.data.reachable !== false
      ? distroAdmin.data.batches
      : (distroStatus.data?.pushed_details ?? []).map(
          (item: DistroBatchInfo): DistroAdminBatchInfo => ({
            ...item,
            status: "complete",
            has_changelog: false,
            has_mpq: true,
            mpq_bytes: item.size_bytes ?? 0,
            announced_at: null,
            uploaded_at: null,
            updated_at: null,
          }),
        );

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
                  <span className="badge badge-green">已发布</span>
                )}
                {pushedBatches.has(item.batch) && (
                  <span className="badge badge-blue">分发端已推送</span>
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

        <DistroBatchSection
          batches={distroBatches}
          localBatches={localBatches}
          onDelete={setPendingDistroDelete}
        />

        {distroStatus.data?.reachable === false && (
          <div className="mt-3 border-t border-border pt-2 text-[11px] text-text-tertiary">
            分发端不可达，无法列出已推送的批次
          </div>
        )}

        <div className="mt-3 border-t border-border pt-2 text-[11px] text-text-tertiary">
          共 {data?.total ?? 0} 个档案 · 混淆等级来自构建 manifest.json
        </div>
      </div>

      {pendingDelete && (
        <DeleteArchiveDialog
          archive={pendingDelete}
          pushedToDistro={pushedBatches.has(pendingDelete.batch)}
          distroReachable={distroStatus.data?.reachable !== false}
          mutation={deleteMutation}
          alsoDeleteDistro={alsoDeleteDistro}
          onAlsoDeleteDistroChange={setAlsoDeleteDistro}
          distroDeleteMutation={distroDeleteMutation}
          onClose={() => {
            setPendingDelete(null);
            setAlsoDeleteDistro(false);
          }}
        />
      )}

      {pendingDistroDelete && (
        <DeleteDistroBatchDialog
          batch={pendingDistroDelete}
          hasLocalCopy={localBatches.has(pendingDistroDelete.batch)}
          mutation={distroDeleteMutation}
          onClose={() => setPendingDistroDelete(null)}
        />
      )}
    </div>
  );
}
