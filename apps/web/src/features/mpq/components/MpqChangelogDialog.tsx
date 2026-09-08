import ReactMarkdown from "react-markdown";
import { useMpqChangelog } from "@/features/mpq/hooks/useMpqViewer";

interface MpqChangelogDialogProps {
  archive: string;
  batch: string;
  onClose: () => void;
}

const markdownComponents = {
  h1: (props: React.ComponentProps<"h1">) => (
    <h1
      className="mb-3 border-b border-border pb-2 text-lg font-bold text-text-primary"
      {...props}
    />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h2 className="mb-2 mt-5 text-base font-semibold text-text-primary" {...props} />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 className="mb-1.5 mt-4 text-sm font-semibold text-text-primary" {...props} />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p className="mb-2.5 text-sm leading-relaxed text-text-secondary" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="mb-2.5 list-disc space-y-1 pl-5 text-sm text-text-secondary" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol className="mb-2.5 list-decimal space-y-1 pl-5 text-sm text-text-secondary" {...props} />
  ),
  li: (props: React.ComponentProps<"li">) => <li className="leading-relaxed" {...props} />,
  a: (props: React.ComponentProps<"a">) => (
    <a
      className="text-accent underline decoration-accent/40 hover:decoration-accent"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  strong: (props: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-text-primary" {...props} />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="mb-2.5 border-l-2 border-accent/40 bg-bg-hover px-3 py-1.5 text-xs text-text-tertiary"
      {...props}
    />
  ),
  code: (props: React.ComponentProps<"code">) => (
    <code
      className="rounded bg-bg-hover px-1 py-0.5 font-mono text-xs text-text-primary"
      {...props}
    />
  ),
  pre: (props: React.ComponentProps<"pre">) => (
    <pre
      className="mb-2.5 overflow-x-auto rounded-md border border-border bg-bg-elevated p-3 font-mono text-xs"
      {...props}
    />
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: (props: React.ComponentProps<"table">) => (
    <table className="data-table mb-2.5 w-full text-sm" {...props} />
  ),
};

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
