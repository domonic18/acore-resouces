import { useEffect } from "react";
import { useWorkspaceClean } from "@/features/resources/hooks/useWorkspaceClean";
import { Dialog } from "@/shared/components/ui/Dialog";

interface CleanDialogProps {
  building: boolean;
  onClose: () => void;
}

function formatSize(sizeBytes: number): string {
  let size = sizeBytes;
  const units = ["B", "KB", "MB", "GB", "TB"];
  for (const unit of units) {
    if (size < 1024 || unit === "TB") {
      return unit === "B" ? `${size} B` : `${size.toFixed(1)} ${unit}`;
    }
    size /= 1024;
  }
  return `${sizeBytes} B`;
}

export function CleanDialog({ building, onClose }: CleanDialogProps) {
  const clean = useWorkspaceClean();
  const result = clean.data;

  useEffect(() => {
    clean.mutate({ execute: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在对话框打开时预览一次
  }, []);

  const isPreview = result?.dry_run ?? true;
  const hasTargets = (result?.targets.length ?? 0) > 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title="清理工作区中间产物"
      subtitle="任务记录 / 未发布 MPQ 批次 / 未发布报告；已发布批次默认跳过，dist 与真相源永不受影响"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => clean.mutate({ execute: false })}
            disabled={clean.isPending}
          >
            重新预览
          </button>
          {isPreview && (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={building || clean.isPending || !hasTargets}
              title={building ? "构建运行中，禁止清理" : "执行清理"}
              onClick={() => clean.mutate({ execute: true })}
            >
              执行清理（释放 {formatSize(result?.total_size_bytes ?? 0)}）
            </button>
          )}
        </div>
      }
    >
      {clean.isPending && !result && (
        <div className="py-8 text-center text-text-secondary">
          正在扫描工作区...
        </div>
      )}
      {clean.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {clean.error instanceof Error
            ? clean.error.message
            : "扫描工作区失败"}
        </div>
      )}
      {result && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-text-secondary">
              {isPreview ? "预览（未删除任何文件）" : "清理结果"}
            </span>
            <span className="text-xs text-text-tertiary">
              总计 {formatSize(result.total_size_bytes)}
            </span>
          </div>

          {hasTargets ? (
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>路径</th>
                  <th>大小</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {result.targets.map((t) => (
                  <tr key={t.path}>
                    <td className="font-mono text-xs">{t.path}</td>
                    <td className="text-xs text-text-secondary">
                      {formatSize(t.size_bytes)}
                    </td>
                    <td className="text-xs text-text-secondary">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-6 text-center text-text-secondary">
              {isPreview ? "没有可清理的产物" : "清理完成"}
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-text-tertiary">
                跳过项
              </div>
              <div className="flex flex-col gap-1">
                {result.skipped.map((s) => (
                  <div
                    key={s.path}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-text-secondary">
                      {s.path}
                    </span>
                    <span className="text-text-tertiary">{s.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {result.errors.map((e) => (
                <div key={e.path}>
                  删除失败 {e.path}: {e.error}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
