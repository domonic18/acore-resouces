import { UploadCloud } from "lucide-react";
import type { WizardPublishStepProps } from "./types";

/** 向导第 3 步（全流程第 ⑨ 步）：发布补丁到分发目录。 */
export function WizardPublishStep({
  canWrite,
  startNumber,
  onStartNumberChange,
  publishDryRun,
  onPublishDryRunChange,
  publishMutation,
  publishResult,
  onPublish,
  onBack,
}: WizardPublishStepProps) {
  return (
    <div className="space-y-4">
      {/* ① 本地发布：只改名移位，产物就位但玩家还拿不到 */}
      <div className="rounded-md border border-border bg-bg-surface p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-[color:var(--gold-btn-text)]">
            1
          </span>
          <span className="text-sm font-semibold text-text-primary">
            本地发布
          </span>
          {publishResult && publishResult.published.length > 0 && (
            <span className="badge badge-success ml-auto">已完成</span>
          )}
        </div>
        <p className="mb-2 text-xs text-text-secondary">
          把补丁包移到{" "}
          <code className="font-mono text-text-primary">
            workspace/dist/
          </code>{" "}
          并重命名为客户端可识别的{" "}
          <code className="font-mono text-text-primary">
            patch-zhCN-编号.mpq
          </code>
          。发布即上架：发布后玩家立即可在「补丁下载」页下载该补丁。
        </p>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-text-secondary">补丁编号</span>
            <input
              type="number"
              min={1}
              value={startNumber}
              onChange={(e) =>
                onStartNumberChange(Number(e.target.value) || 1)
              }
              className="w-20 rounded-md border border-border bg-bg-elevated px-2 py-1 text-sm"
            />
            <span className="text-xs text-text-tertiary">
              客户端按编号顺序加载，不能与已有编号重复
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={publishDryRun}
              onChange={(e) => onPublishDryRunChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
            />
            <span>
              <span className="text-text-primary">先预览，不真的发布</span>
              <span className="ml-2 text-xs text-text-tertiary">
                只显示会发布哪些批次，不会移动任何文件
              </span>
            </span>
          </label>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onPublish}
            disabled={!canWrite || publishMutation.isPending}
            title={canWrite ? undefined : "仅管理员可发布补丁"}
            className="btn btn-primary"
          >
            <UploadCloud className="h-4 w-4" />
            {publishMutation.isPending
              ? "发布中..."
              : publishDryRun
                ? "预览发布"
                : "发布补丁"}
          </button>
          <button type="button" className="btn" onClick={onBack}>
            上一步
          </button>
        </div>

        {publishMutation.isError && (
          <div className="mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {publishMutation.error instanceof Error
              ? publishMutation.error.message
              : "发布失败"}
          </div>
        )}

        {publishResult && (
          <div
            className={`mt-2 rounded-md border px-3 py-2 text-xs ${
              publishDryRun
                ? "border-info/30 bg-info/10 text-info"
                : "border-success/30 bg-success/10 text-success"
            }`}
          >
            {publishResult.preview.length === 0 &&
              publishResult.skipped.length === 0 && (
                <div>
                  没有找到可发布的批次——本次构建的产物可能已被发布过。
                </div>
              )}
            {publishResult.preview.length > 0 && (
              <>
                <div className="font-semibold">
                  {publishDryRun
                    ? `预览：将发布 ${publishResult.preview.length} 个批次（未执行任何发布）`
                    : `已发布 ${publishResult.preview.length} 个批次`}
                </div>
                <ul className="mt-1 space-y-0.5 text-text-secondary">
                  {publishResult.preview.map((item) => (
                    <li key={item.batch} className="break-all">
                      补丁 #{item.patch_number} · {item.batch} → {item.path}
                    </li>
                  ))}
                </ul>
                {!publishDryRun && (
                  <div className="mt-1 text-text-secondary">
                    下一个可用编号 {publishResult.next_number}
                  </div>
                )}
              </>
            )}
            {publishResult.skipped.length > 0 && (
              <div className="mt-1 text-text-secondary">
                已跳过（之前发布过）：{publishResult.skipped.join("、")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
