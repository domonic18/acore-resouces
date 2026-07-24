import { useState } from "react";
import { PackagePlus, Check, Copy, X } from "lucide-react";
import { usePatchExport } from "@/features/resources/hooks/usePatchExport";
import { getPatchJobAbsoluteUrl } from "@/shared/patches";
import type { PatchJob } from "@/shared/types";

interface BulkPatchExportButtonProps {
  resourceType: string;
  resourceIds: number[];
}

export function BulkPatchExportButton({
  resourceType,
  resourceIds,
}: BulkPatchExportButtonProps) {
  const [result, setResult] = useState<{ jobs: PatchJob[] } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const mutation = usePatchExport();

  const handleExport = () => {
    if (resourceIds.length === 0) return;
    setResult(null);
    mutation.mutate(
      { resourceType, resourceIds },
      {
        onSuccess: (data) => setResult(data),
      },
    );
  };

  const handleCopy = async (jobId: string) => {
    await navigator.clipboard.writeText(jobId);
    setCopiedId(jobId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const disabled = resourceIds.length === 0 || mutation.isPending;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleExport}
        disabled={disabled}
        className="btn btn-primary"
        title="批量导出选中资源的补丁原料包"
      >
        <PackagePlus className="h-4 w-4" />
        {mutation.isPending
          ? "导出中..."
          : `导出补丁原料 (${resourceIds.length})`}
      </button>

      {mutation.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "导出失败"}
        </div>
      )}

      {result && result.jobs.length > 0 && (
        <div className="relative rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <Check className="h-3.5 w-3.5" />
            已生成 {result.jobs.length} 个补丁任务
          </div>
          <ul className="max-h-32 space-y-1 overflow-auto">
            {result.jobs.map((job) => (
              <li key={job.job_id} className="flex items-center gap-2">
                <span className="font-mono">{job.job_id}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(job.job_id)}
                  className="btn btn-icon btn-sm btn-ghost text-success hover:text-success"
                  title="复制任务 ID"
                  aria-label="复制任务 ID"
                >
                  {copiedId === job.job_id ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                <a
                  href={getPatchJobAbsoluteUrl(job.job_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-success underline hover:no-underline"
                >
                  查看
                </a>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="btn btn-icon btn-sm btn-ghost absolute right-2 top-2"
            title="关闭"
            aria-label="关闭"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
