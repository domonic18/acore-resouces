import ReactMarkdown from "react-markdown";
import { useMpqChangelog } from "@/features/mpq/hooks/useMpqViewer";
import { markdownComponents } from "@/shared/markdown";
import { Dialog } from "@/shared/components/ui/Dialog";

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
    <Dialog
      open
      onClose={onClose}
      title="补丁变更日志"
      subtitle={`批次 ${batch} · changelog.md`}
    >
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
    </Dialog>
  );
}
