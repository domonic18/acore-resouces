import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { usePatchPublish } from "@/features/resources/hooks/usePatchPublish";

export function PublishPanel() {
  const [startNumber, setStartNumber] = useState(5);
  const [dryRun, setDryRun] = useState(true);
  const publishMutation = usePatchPublish();

  const handlePublish = () => {
    publishMutation.mutate({ start_number: startNumber, dry_run: dryRun });
  };

  const result = publishMutation.data;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          补丁起始编号
          <input
            type="number"
            min={1}
            value={startNumber}
            onChange={(e) => setStartNumber(Number(e.target.value) || 1)}
            className="w-20 rounded-md border border-border bg-bg-elevated px-2 py-1 text-sm"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="h-4 w-4 accent-blue-500"
          />
          仅预览
        </label>
      </div>

      <button
        type="button"
        onClick={handlePublish}
        disabled={publishMutation.isPending}
        className="btn btn-primary w-full"
      >
        <UploadCloud className="h-4 w-4" />
        {publishMutation.isPending ? "发布中..." : "发布 MPQ 补丁"}
      </button>

      {publishMutation.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {publishMutation.error instanceof Error
            ? publishMutation.error.message
            : "发布失败"}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          {result.published.length === 0 && result.skipped.length === 0 && (
            <div>workspace/mpq/ 中没有可发布的批次</div>
          )}
          {result.published.length > 0 && (
            <div className="font-semibold">
              已发布 {result.published.length} 个批次（下一个编号{" "}
              {result.next_number}）
            </div>
          )}
          <ul className="mt-1 space-y-0.5 text-text-secondary">
            {result.published.map((item) => (
              <li key={item.batch} className="break-all">
                {item.batch} → {item.path}
              </li>
            ))}
            {result.skipped.length > 0 && (
              <li>已跳过（之前发布过）：{result.skipped.join("、")}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
