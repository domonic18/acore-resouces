import { useEffect, useState } from "react";
import { CheckCircle2, Hammer, Loader2, RotateCcw, UploadCloud } from "lucide-react";
import { MountMultiSelect } from "@/features/resources/components/patch-export/MountMultiSelect";
import { BuildLogView } from "@/features/resources/components/patch-export/BuildLogView";
import { StepIndicator } from "@/features/resources/components/patch-export/StepIndicator";
import { BulkPatchExportButton } from "@/features/resources/components/BulkPatchExportButton";
import { useBuildStatus, usePatchBuild } from "@/features/resources/hooks/usePatchBuild";
import { usePatchPublish } from "@/features/resources/hooks/usePatchPublish";

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  return ms >= 60_000
    ? `${(ms / 60_000).toFixed(1)} 分钟`
    : `${(ms / 1000).toFixed(1)} 秒`;
}

export function ExportWizard() {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const [startNumber, setStartNumber] = useState(5);
  const [publishDryRun, setPublishDryRun] = useState(true);

  const buildStatus = useBuildStatus();
  const buildMutation = usePatchBuild();
  const publishMutation = usePatchPublish();

  const building = buildStatus.data?.running ?? false;
  const status = buildStatus.data;
  const buildResult = status?.result ?? null;
  const buildError = status?.error ?? null;
  const publishResult = publishMutation.data ?? null;

  useEffect(() => {
    if (status?.running) setStep(1);
  }, [status?.running]);

  const buildSucceeded = buildResult !== null && buildError === null;

  const handleBuild = () => {
    buildMutation.mutate({ all_requested: true, dry_run: dryRun, force });
  };

  const handlePublish = () => {
    publishMutation.mutate(
      { start_number: startNumber, dry_run: publishDryRun },
      { onSuccess: () => setStep(3) },
    );
  };

  const handleReset = () => {
    setSelectedIds([]);
    setStep(0);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">制作补丁包</div>
          <div className="card-subtitle">
            按步骤完成：选择坐骑 → 构建补丁 → 发布到分发目录
          </div>
        </div>
        <StepIndicator current={Math.min(step, 2)} />
      </div>
      <div className="card-body space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            <MountMultiSelect selected={selectedIds} onChange={setSelectedIds} />
            <div className="flex items-center gap-3">
              <BulkPatchExportButton
                resourceType="mount"
                resourceIds={selectedIds}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={selectedIds.length === 0}
                onClick={() => setStep(1)}
              >
                下一步：构建补丁
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                干跑模式（仅校验冲突并生成计划，不修改源文件）
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="h-4 w-4 accent-red-500"
                />
                <span className="text-danger">
                  强制重写已存在的 DBC 记录（全量重建）
                </span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBuild}
                disabled={building || buildMutation.isPending}
                className="btn btn-primary"
              >
                {building ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> 构建中...
                  </>
                ) : (
                  <>
                    <Hammer className="h-4 w-4" />
                    {dryRun ? "干跑校验全部待处理任务" : "构建全部待处理任务"}
                  </>
                )}
              </button>
              <button type="button" className="btn" onClick={() => setStep(0)}>
                上一步
              </button>
              <button
                type="button"
                className="btn"
                disabled={!buildSucceeded}
                onClick={() => setStep(2)}
                title={buildSucceeded ? "" : "先成功完成构建"}
              >
                下一步：发布补丁
              </button>
            </div>

            {buildMutation.isError && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {buildMutation.error instanceof Error
                  ? buildMutation.error.message
                  : "构建启动失败"}
              </div>
            )}
            {buildError && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {buildError}
              </div>
            )}

            <BuildLogView
              lines={status?.log ?? []}
              running={building}
              progress={status?.progress ?? { current: 0, total: 0, current_job: null }}
            />

            {buildSucceeded && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                <div className="font-semibold">
                  {buildResult.dry_run ? "干跑完成" : "构建完成"} · 处理{" "}
                  {buildResult.jobs.length} 个任务 · 耗时{" "}
                  {formatDuration(status?.started_at ?? null, status?.finished_at ?? null)}
                </div>
                <ul className="mt-1 space-y-0.5 text-text-secondary">
                  <li>新增 SQL：{buildResult.sql_files.length} 个文件</li>
                  {buildResult.mpq_path && (
                    <li className="break-all">MPQ：{buildResult.mpq_path}</li>
                  )}
                  {buildResult.dry_run && (
                    <li>干跑未生成产物，关闭干跑后重新构建才能发布。</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
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
                  checked={publishDryRun}
                  onChange={(e) => setPublishDryRun(e.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                仅预览
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishMutation.isPending}
                className="btn btn-primary"
              >
                <UploadCloud className="h-4 w-4" />
                {publishMutation.isPending ? "发布中..." : "发布 MPQ 补丁"}
              </button>
              <button type="button" className="btn" onClick={() => setStep(1)}>
                上一步
              </button>
            </div>

            {publishMutation.isError && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {publishMutation.error instanceof Error
                  ? publishMutation.error.message
                  : "发布失败"}
              </div>
            )}

            {publishResult && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                {publishResult.published.length === 0 &&
                  publishResult.skipped.length === 0 && (
                    <div>workspace/mpq/ 中没有可发布的批次</div>
                  )}
                {publishResult.published.length > 0 && (
                  <div className="font-semibold">
                    已发布 {publishResult.published.length} 个批次（下一个编号{" "}
                    {publishResult.next_number}）
                  </div>
                )}
                <ul className="mt-1 space-y-0.5 text-text-secondary">
                  {publishResult.published.map((item) => (
                    <li key={item.batch} className="break-all">
                      {item.batch} → {item.path}
                    </li>
                  ))}
                  {publishResult.skipped.length > 0 && (
                    <li>已跳过（之前发布过）：{publishResult.skipped.join("、")}</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold text-text-primary">
                补丁包制作流程已完成
              </span>
            </div>
            {buildSucceeded && (
              <ul className="space-y-0.5 text-sm text-text-secondary">
                <li>
                  构建：处理 {buildResult.jobs.length} 个任务
                  {buildResult.dry_run ? "（干跑）" : ""}，新增 SQL{" "}
                  {buildResult.sql_files.length} 个文件，耗时{" "}
                  {formatDuration(status?.started_at ?? null, status?.finished_at ?? null)}
                </li>
                {buildResult.mpq_path && (
                  <li className="break-all font-mono text-xs">
                    MPQ：{buildResult.mpq_path}
                  </li>
                )}
                {publishResult && (
                  <li>
                    发布：
                    {publishResult.published.length > 0
                      ? `已发布 ${publishResult.published.length} 个批次，下一个编号 ${publishResult.next_number}`
                      : "无可发布批次"}
                  </li>
                )}
              </ul>
            )}
            <div>
              <button type="button" className="btn" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" /> 再制作一批
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
