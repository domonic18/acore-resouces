import { Download, FileText } from "lucide-react";
import {
  getBlpPreviewUrl,
  getFilePreviewUrl,
} from "@/shared/resources";
import { CopyButton } from "@/shared/components/CopyButton";
import { formatBytes } from "@/features/dbc/lib/columns";
import { useMpqFile } from "@/features/mpq/hooks/useMpqViewer";
import { MpqDbcViewer } from "@/features/mpq/components/MpqDbcViewer";

interface MpqContentPanelProps {
  archive: string | null;
  path: string | null;
}

const KIND_LABELS: Record<string, string> = {
  text: "文本",
  blp: "BLP 贴图",
  dbc: "DBC 数据",
  binary: "二进制",
};

/** 内容面板：按扩展名分发——文本直显 / BLP 贴图 / DBC 记录表格 / 二进制下载。 */
export function MpqContentPanel({ archive, path }: MpqContentPanelProps) {
  const { data, isLoading, isError, error } = useMpqFile(archive, path);

  if (!archive || !path) {
    return (
      <div className="card">
        <div className="card-body py-12 text-center text-sm text-text-secondary">
          在文件树中选择文件查看内容
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-body py-12 text-center text-sm text-text-secondary">
          提取文件中...
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="card">
        <div className="card-body py-10 text-center text-sm text-danger">
          {error instanceof Error ? error.message : "文件提取失败"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <div className="min-w-0">
            <div className="card-title flex flex-wrap items-center gap-2">
              <span className="break-all font-mono">{data.path}</span>
              <span className="badge badge-blue">
                {KIND_LABELS[data.kind] ?? data.kind}
              </span>
              <span className="badge badge-gray">{formatBytes(data.size)}</span>
            </div>
            {data.cache_abs_path && (
              <div className="mt-1.5 flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 break-all rounded bg-bg-surface px-2 py-1 font-mono text-[11px] text-text-secondary"
                  title="提取缓存磁盘位置"
                >
                  {data.cache_abs_path}
                </code>
                <CopyButton
                  value={data.cache_abs_path}
                  title="复制提取文件完整路径"
                />
              </div>
            )}
          </div>
          {data.cache_path && (
            <a
              className="btn btn-sm shrink-0"
              href={getFilePreviewUrl(data.cache_path)}
              download
            >
              <Download className="h-3.5 w-3.5" /> 下载原文件
            </a>
          )}
        </div>
      </div>

      {data.kind === "text" && (
        <div className="card">
          <div className="card-body">
            <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-bg-surface p-4 font-mono text-xs leading-5 text-text-primary">
              {data.content}
            </pre>
          </div>
        </div>
      )}

      {data.kind === "blp" && data.cache_path && (
        <div className="card">
          <div className="card-body flex justify-center p-6">
            <img
              src={getBlpPreviewUrl(data.cache_path)}
              alt={data.path}
              className="max-h-[480px] max-w-full rounded-md border border-border bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#242424_0%_50%)] bg-[length:16px_16px] object-contain"
            />
          </div>
        </div>
      )}

      {data.kind === "dbc" && <MpqDbcViewer archive={archive} path={path} />}

      {data.kind === "binary" && (
        <div className="card">
          <div className="card-body flex flex-col items-center gap-3 py-12 text-text-secondary">
            <FileText className="h-10 w-10 text-text-tertiary" />
            <div className="text-sm">二进制文件不支持预览</div>
            {data.cache_path && (
              <a
                className="btn btn-sm"
                href={getFilePreviewUrl(data.cache_path)}
                download
              >
                <Download className="h-3.5 w-3.5" /> 下载查看
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
