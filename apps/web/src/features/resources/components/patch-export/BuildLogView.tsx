import { useEffect, useRef } from "react";
import type { BuildLogEntry, BuildProgress } from "@/shared/types";

interface BuildLogViewProps {
  lines: BuildLogEntry[];
  running: boolean;
  progress: BuildProgress;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
}

export function BuildLogView({ lines, running, progress }: BuildLogViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const showProgress = progress.total > 0;

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border bg-bg-elevated px-3 py-1.5">
        <span className="text-xs font-medium text-text-secondary">
          构建输出
        </span>
        <span className="font-mono text-xs text-text-tertiary">
          {running && showProgress
            ? `${progress.current}/${progress.total}${
                progress.current_job ? ` · ${progress.current_job}` : ""
              }`
            : showProgress
              ? `${progress.current}/${progress.total}`
              : ""}
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-72 overflow-y-auto bg-bg-surface p-3 font-mono text-xs leading-5"
      >
        {lines.length === 0 ? (
          <div className="text-text-tertiary">
            {running ? "等待构建输出..." : "尚未开始构建"}
          </div>
        ) : (
          lines.map((entry, index) => (
            <div key={index} className="whitespace-pre-wrap break-all">
              <span className="text-text-tertiary">
                {formatTime(entry.ts)}{" "}
              </span>
              <span
                className={
                  entry.message.startsWith("ERROR")
                    ? "text-danger"
                    : "text-text-secondary"
                }
              >
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
