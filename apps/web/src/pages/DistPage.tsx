import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/features/auth/useAuth";
import {
  useDistBatchDelete,
  useDistChangelog,
  useDistTree,
} from "@/features/dist/hooks/useDist";
import { distDownloadUrl } from "@/shared/dist";
import { markdownComponents } from "@/shared/markdown";
import { Dialog } from "@/shared/components/ui/Dialog";
import { getAccessToken } from "@/shared/auth";
import { formatBytes } from "@/features/dbc/lib/columns";
import type { DistBatchMeta, DistTreeNode } from "@/shared/dist";
import "@/features/dist/dist-wow.css";

/** 最新批次卡片数量，其余进入历史折叠区（与旧分发站一致） */
const LATEST_COUNT = 5;

interface BatchEntry {
  meta: DistBatchMeta;
  mpqPath: string | null;
}

function collectBatches(root: DistTreeNode | undefined): BatchEntry[] {
  if (!root) return [];
  return root.children
    .filter(
      (node): node is DistTreeNode & { meta: DistBatchMeta } =>
        node.type === "dir" && node.meta !== null && "patch_number" in node.meta,
    )
    .map((node) => ({
      meta: node.meta,
      mpqPath:
        node.children.find((child) => child.name.endsWith(".mpq"))?.path ?? null,
    }))
    .sort((a, b) => (b.meta.patch_number ?? 0) - (a.meta.patch_number ?? 0));
}

/** 批次目录名 20261123_043339 → 2026-11-23 04:33:39 */
function formatBatchStamp(batch: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(batch);
  return m
    ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`
    : "";
}

function batchStamp(meta: DistBatchMeta): string {
  return formatBatchStamp(meta.batch) || (meta.generated_at ?? "").slice(0, 10);
}

function TitleOrnament() {
  return (
    <div className="title-ornament">
      <span />
      <i>◆</i>
      <span />
    </div>
  );
}

function Md5Chip({ md5, compact = false }: { md5: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`md5-chip${copied ? " copied" : ""}${compact ? " md5-chip-compact" : ""}`}
      title={compact ? `MD5 ${md5}（点击复制）` : "点击复制 MD5"}
      onClick={() => {
        void navigator.clipboard.writeText(md5).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {!compact && <span className="md5-label">🔑 MD5</span>}
      <code>{compact ? `${md5.slice(0, 8)}…` : md5}</code>
    </button>
  );
}

function MetaChips({ meta }: { meta: DistBatchMeta }) {
  return (
    <div className="patch-meta">
      <span className="meta-chip">🗓 {batchStamp(meta)}</span>
      {meta.size_bytes != null && (
        <span className="meta-chip">📦 {formatBytes(meta.size_bytes)}</span>
      )}
      {meta.file_count != null && (
        <span className="meta-chip">{meta.file_count} 个文件</span>
      )}
      {meta.mount_count != null && (
        <span className="meta-chip">🐎 {meta.mount_count} 只坐骑</span>
      )}
    </div>
  );
}

interface PatchCardProps {
  entry: BatchEntry;
  isLatest: boolean;
  isAdmin: boolean;
  onChangelog: (batch: string) => void;
  onOffline: (batch: string) => void;
}

function PatchCard({
  entry,
  isLatest,
  isAdmin,
  onChangelog,
  onOffline,
}: PatchCardProps) {
  const token = getAccessToken();
  const meta = entry.meta;
  const downloadHref = entry.mpqPath && token
    ? distDownloadUrl(entry.mpqPath, token)
    : undefined;
  return (
    <article className="patch-card">
      <div className="patch-medal">
        <span className="medal-label">补丁</span>
        <span className="medal-number">#{meta.patch_number ?? "?"}</span>
      </div>
      <div className="patch-info">
        <div className="patch-name-row">
          {downloadHref ? (
            <a className="patch-name" href={downloadHref} download>
              {entry.mpqPath?.split("/").pop()}
            </a>
          ) : (
            <span className="patch-name">{meta.patch_file ?? meta.batch}</span>
          )}
          {isLatest && <span className="badge-latest">最新</span>}
        </div>
        <MetaChips meta={meta} />
        {meta.md5 && (
          <div className="md5-row">
            <Md5Chip md5={meta.md5} />
          </div>
        )}
      </div>
      <div className="patch-actions">
        {downloadHref && (
          <a className="btn-wow" href={downloadHref} download>
            ⬇ 下载补丁
          </a>
        )}
        {meta.has_changelog && (
          <button
            type="button"
            className="btn-ghost-gold"
            onClick={() => onChangelog(meta.batch)}
          >
            📜 更新公告
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className="btn-ghost-danger"
            title="下线该批次（玩家将无法再下载）"
            onClick={() => onOffline(meta.batch)}
          >
            下线
          </button>
        )}
      </div>
    </article>
  );
}

interface HistoryRowProps {
  entry: BatchEntry;
  isAdmin: boolean;
  onChangelog: (batch: string) => void;
  onOffline: (batch: string) => void;
}

function HistoryRow({ entry, isAdmin, onChangelog, onOffline }: HistoryRowProps) {
  const token = getAccessToken();
  const meta = entry.meta;
  const downloadHref = entry.mpqPath && token
    ? distDownloadUrl(entry.mpqPath, token)
    : undefined;
  return (
    <div className="history-row">
      <span className="hist-number">#{meta.patch_number ?? "?"}</span>
      <div className="hist-main min-w-0">
        {downloadHref ? (
          <a className="hist-name" href={downloadHref} download>
            {entry.mpqPath?.split("/").pop()}
          </a>
        ) : (
          <span className="hist-name">{meta.patch_file ?? meta.batch}</span>
        )}
        <div className="hist-meta">
          <span className="hist-chip">🗓 {batchStamp(meta)}</span>
          {meta.size_bytes != null && (
            <span className="hist-chip">📦 {formatBytes(meta.size_bytes)}</span>
          )}
        </div>
        {meta.md5 && <Md5Chip md5={meta.md5} compact />}
      </div>
      <div className="hist-actions">
        {downloadHref && (
          <a className="hist-btn" href={downloadHref} download title="下载补丁">
            ⬇
          </a>
        )}
        {meta.has_changelog && (
          <button
            type="button"
            className="hist-btn"
            title="更新公告"
            onClick={() => onChangelog(meta.batch)}
          >
            📜
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className="hist-btn"
            title="下线该批次（玩家将无法再下载）"
            onClick={() => onOffline(meta.batch)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ChangelogDialog({
  batch,
  onClose,
}: {
  batch: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useDistChangelog(batch);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="changelog-layer" onClick={onClose}>
      <div
        className="changelog-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="dialog-close"
          onClick={onClose}
          aria-label="关闭"
        >
          ✕
        </button>
        <div className="dialog-title">更新公告 · 补丁批次 {batch}</div>
        <div className="dialog-ornament">
          <span />
          <i>◆</i>
          <span />
        </div>
        <div className="md-body">
          {isLoading && <p className="loading">加载中...</p>}
          {isError && (
            <p className="error-box">
              公告加载失败：
              {error instanceof Error ? error.message : "未知错误"}
            </p>
          )}
          {data && (
            <article>
              <ReactMarkdown components={markdownComponents}>
                {data.changelog}
              </ReactMarkdown>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

function OfflineDialog({
  batch,
  onClose,
}: {
  batch: string;
  onClose: () => void;
}) {
  const mutation = useDistBatchDelete();
  return (
    <Dialog
      open
      onClose={onClose}
      title="下线补丁批次"
      subtitle={`批次 ${batch}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(batch, { onSuccess: onClose })}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {mutation.isPending ? "下线中..." : "确认下线"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          下线会删除该批次的补丁文件与元数据，玩家将<b>无法再下载</b>，
          已经下载到本地的客户端不受影响。这一步<b>不可撤销</b>。
        </div>
        {mutation.isError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            下线失败：
            {mutation.error instanceof Error ? mutation.error.message : "未知错误"}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function DistPage() {
  const { isAdmin } = useAuth();
  const treeQuery = useDistTree();
  const [changelogBatch, setChangelogBatch] = useState<string | null>(null);
  const [offlineBatch, setOfflineBatch] = useState<string | null>(null);

  const batches = useMemo(() => collectBatches(treeQuery.data), [treeQuery.data]);
  const latest = batches.slice(0, LATEST_COUNT);
  const history = batches.slice(LATEST_COUNT);

  const shared = { isAdmin, onChangelog: setChangelogBatch, onOffline: setOfflineBatch };

  return (
    <div className="dist-wow">
      <div className="dist-wow-inner">
        <h1 className="page-title">补丁下载</h1>
        <TitleOrnament />
        <p className="subtitle">
          下载最新的补丁文件放入游戏客户端 <b>Data</b> 目录；「更新公告」查看本批次的更新内容。
        </p>

        {treeQuery.isLoading && (
          <p className="loading">正在召唤补丁列表...</p>
        )}

        {treeQuery.isError && (
          <p className="error-box">
            补丁列表加载失败：
            {treeQuery.error instanceof Error
              ? treeQuery.error.message
              : "未知错误"}
          </p>
        )}

        {!treeQuery.isLoading && !treeQuery.isError && batches.length === 0 && (
          <div className="empty-state">
            <span className="empty-ornament">◆ ◇ ◆</span>
            <p>暂无补丁</p>
          </div>
        )}

        {!treeQuery.isLoading && !treeQuery.isError && batches.length > 0 && (
          <>
            <div className="patch-list">
              {latest.map((entry, index) => (
                <PatchCard
                  key={entry.meta.batch}
                  entry={entry}
                  isLatest={index === 0}
                  {...shared}
                />
              ))}
            </div>
            {history.length > 0 && (
              <details className="history-block">
                <summary>
                  📜 历史补丁
                  <span className="hist-count">{history.length} 个</span>
                </summary>
                <div className="history-list">
                  {history.map((entry) => (
                    <HistoryRow key={entry.meta.batch} entry={entry} {...shared} />
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        <p className="footer-note">仅供内测使用</p>
      </div>

      {changelogBatch && (
        <ChangelogDialog
          batch={changelogBatch}
          onClose={() => setChangelogBatch(null)}
        />
      )}
      {offlineBatch && (
        <OfflineDialog batch={offlineBatch} onClose={() => setOfflineBatch(null)} />
      )}
    </div>
  );
}
