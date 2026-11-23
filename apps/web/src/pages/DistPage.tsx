import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Download,
  FileText,
  HardDriveDownload,
  Loader2,
  Package,
  Trash2,
} from "lucide-react";
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
    .sort((a, b) => b.meta.batch.localeCompare(a.meta.batch));
}

function formatAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function CopyMd5Button({ md5 }: { md5: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!md5) return null;
  return (
    <button
      type="button"
      className="btn btn-sm"
      title="复制 MD5 校验值"
      onClick={() => {
        void navigator.clipboard.writeText(md5).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      MD5
    </button>
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
  return (
    <Dialog
      open
      onClose={onClose}
      title="更新公告"
      subtitle={`批次 ${batch}`}
    >
      {isLoading && (
        <div className="py-8 text-center text-sm text-text-secondary">
          加载中...
        </div>
      )}
      {isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          公告加载失败：{error instanceof Error ? error.message : "未知错误"}
        </div>
      )}
      {data && (
        <article className="markdown-body">
          <ReactMarkdown components={markdownComponents}>
            {data.changelog}
          </ReactMarkdown>
        </article>
      )}
    </Dialog>
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
        {mutation.data && mutation.data.existed && (
          <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            已下线，释放 {formatBytes(mutation.data.freed_bytes)}。
          </div>
        )}
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

interface BatchCardProps {
  entry: BatchEntry;
  isAdmin: boolean;
  onChangelog: (batch: string) => void;
  onOffline: (batch: string) => void;
}

function BatchCard({ entry, isAdmin, onChangelog, onOffline }: BatchCardProps) {
  const token = getAccessToken();
  const meta = entry.meta;
  return (
    <div className="card">
      <div className="card-body">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Package className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary">
              补丁 #{meta.patch_number ?? "?"}
            </div>
            <div className="font-mono text-[11px] text-text-tertiary">
              {meta.batch}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {entry.mpqPath && token && (
              <a
                className="btn btn-sm btn-primary"
                href={distDownloadUrl(entry.mpqPath, token)}
                download
              >
                <Download className="h-3.5 w-3.5" />
                下载补丁
              </a>
            )}
            {meta.has_changelog && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => onChangelog(meta.batch)}
              >
                <FileText className="h-3.5 w-3.5" />
                更新公告
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className="btn btn-sm text-danger hover:text-danger"
                title="下线该批次（玩家将无法再下载）"
                onClick={() => onOffline(meta.batch)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                下线
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
          {meta.size_bytes != null && (
            <span className="flex items-center gap-1">
              <HardDriveDownload className="h-3.5 w-3.5" />
              {formatBytes(meta.size_bytes)}
            </span>
          )}
          {meta.mount_count != null && <span>{meta.mount_count} 只坐骑</span>}
          <span>构建时间 {formatAt(meta.generated_at)}</span>
        </div>
        <div className="mt-1">
          <CopyMd5Button md5={meta.md5} />
        </div>
      </div>
    </div>
  );
}

export function DistPage() {
  const { isAdmin } = useAuth();
  const treeQuery = useDistTree();
  const [changelogBatch, setChangelogBatch] = useState<string | null>(null);
  const [offlineBatch, setOfflineBatch] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const batches = useMemo(() => collectBatches(treeQuery.data), [treeQuery.data]);
  const latest = batches.slice(0, 5);
  const history = batches.slice(5);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text-primary">补丁下载</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          下载客户端自定义补丁包（MPQ）。下载后放入游戏目录
          <code className="mx-1 font-mono text-xs">World of Warcraft/Data/</code>
          ，重启客户端生效。
        </p>
      </div>

      {treeQuery.isLoading && (
        <div className="card">
          <div className="card-body flex items-center justify-center gap-2 py-10 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
          </div>
        </div>
      )}

      {treeQuery.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          补丁列表加载失败：
          {treeQuery.error instanceof Error
            ? treeQuery.error.message
            : "未知错误"}
        </div>
      )}

      {!treeQuery.isLoading && !treeQuery.isError && batches.length === 0 && (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Package className="mb-4 h-12 w-12 text-text-tertiary" />
              <h3>暂无可下载的补丁</h3>
              <p>管理员发布补丁后会出现在这里。</p>
            </div>
          </div>
        </div>
      )}

      {latest.map((entry) => (
        <BatchCard
          key={entry.meta.batch}
          entry={entry}
          isAdmin={isAdmin}
          onChangelog={setChangelogBatch}
          onOffline={setOfflineBatch}
        />
      ))}

      {history.length > 0 && (
        <div className="card">
          <div className="card-body">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-sm font-medium text-text-secondary"
              onClick={() => setHistoryOpen((open) => !open)}
            >
              {historyOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              历史批次（{history.length}）
            </button>
            {historyOpen && (
              <div className="mt-2 space-y-2">
                {history.map((entry) => (
                  <BatchCard
                    key={entry.meta.batch}
                    entry={entry}
                    isAdmin={isAdmin}
                    onChangelog={setChangelogBatch}
                    onOffline={setOfflineBatch}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
