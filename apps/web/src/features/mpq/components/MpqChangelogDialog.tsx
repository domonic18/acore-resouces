import ReactMarkdown from "react-markdown";
import { useMpqChangelog } from "@/features/mpq/hooks/useMpqViewer";
import { markdownComponents } from "@/shared/markdown";

interface MpqChangelogDialogProps {
  archive: string;
  batch: string;
  onClose: () => void;
}

export function MpqChangelogDialog({
  archive,
  batch,
  onClose,
}: MpqChangelogDialogProps) {
  const { data, isLoading, isError, error } = useMpqChangelog(archive);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              补丁变更日志
            </h3>
            <p className="mt-0.5 font-mono text-xs text-text-tertiary">
              批次 {batch} · changelog.md
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onClose}
            title="关闭"
          >
            关闭
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="py-8 text-center text-sm text-text-secondary">
              加载中...
            </div>
          )}
          {isError && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              变更日志加载失败：
              {error instanceof Error ? error.message : "未知错误"}
            </div>
          )}
          {data && (
            <article className="markdown-body">
              <ReactMarkdown components={markdownComponents}>
                {data.content}
              </ReactMarkdown>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
