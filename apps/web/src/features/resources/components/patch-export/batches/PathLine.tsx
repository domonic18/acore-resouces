import { artifactUrl } from "@/shared/patches";

/** 产物路径：能指向文件的就做成可点击的下载链接 */
export function PathLine({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  if (!value) return null;
  const isDir = !/\.[A-Za-z0-9]+$/.test(value);
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-xs text-text-tertiary">{label}</span>
      {isDir ? (
        <span className="truncate font-mono text-xs text-text-secondary" title={value}>
          {value}
        </span>
      ) : (
        <a
          href={artifactUrl(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate font-mono text-xs text-accent hover:underline"
          title={`打开 ${value}`}
        >
          {value}
        </a>
      )}
    </div>
  );
}
