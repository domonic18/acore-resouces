import { CopyButton } from "@/shared/components/CopyButton";
import { API_BASE } from "@/shared/api";
import type { JobArtifactsOut } from "@/shared/types";

interface ArtifactListProps {
  artifacts: JobArtifactsOut;
}

/** 补丁产物清单：文件类产物可点击下载，目录类只给路径。 */
export function ArtifactList({ artifacts }: ArtifactListProps) {
  if (artifacts.entries.length === 0) {
    return (
      <div className="rounded-md border border-border bg-bg-surface px-3 py-2 text-xs text-text-tertiary">
        暂无产物。
      </div>
    );
  }

  return (
    <ul className="space-y-1 text-xs">
      {artifacts.entries.map((entry) => (
        <li
          key={`${entry.kind}-${entry.path}`}
          className="flex items-center gap-2"
        >
          <span className="w-24 shrink-0 text-text-tertiary">{entry.label}</span>
          {entry.url ? (
            <a
              href={`${API_BASE}${entry.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-mono text-accent hover:underline"
              title={entry.path ?? undefined}
            >
              {entry.path}
            </a>
          ) : (
            <span
              className="truncate font-mono text-text-secondary"
              title={entry.path ?? undefined}
            >
              {entry.path ?? "—"}
            </span>
          )}
          {!entry.exists && (
            <span className="badge badge-gray shrink-0">已清理</span>
          )}
          {entry.size_bytes !== null && entry.exists && (
            <span className="shrink-0 text-text-tertiary">
              {(entry.size_bytes / 1024 / 1024).toFixed(1)} MB
            </span>
          )}
          {entry.path && (
            <CopyButton
              value={entry.path}
              className="ml-auto shrink-0"
              label=""
              title="复制路径"
            />
          )}
        </li>
      ))}
    </ul>
  );
}
