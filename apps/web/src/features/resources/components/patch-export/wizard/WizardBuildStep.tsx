import {
  AlertTriangle,
  ArrowLeft,
  Hammer,
  Loader2,
  PackagePlus,
} from "lucide-react";
import { BuildLogView } from "@/features/resources/components/patch-export/BuildLogView";
import { ScopeOption } from "./ScopeOption";
import { formatDuration } from "./shared";
import type { WizardBuildStepProps } from "./types";

/** 向导第 1 步（全流程第 ⑦ 步）：构建补丁。 */
export function WizardBuildStep({
  canWrite,
  incomingJobIds,
  showingIncoming,
  handoverCount,
  jobIds,
  jobNameById,
  allPendingCount,
  dryRun,
  onDryRunChange,
  force,
  onForceChange,
  obfuscation,
  onObfuscationChange,
  buildAll,
  onBuildAllChange,
  building,
  buildMutation,
  status,
  buildResult,
  buildError,
  hasBuildArtifacts,
  onBuild,
  onRealBuild,
  onBackToSelection,
  onNext,
}: WizardBuildStepProps) {
  const buildSucceeded = buildResult !== null && buildError === null;

  // 「审查产物」被禁用时的说明：光有灰按钮没有解释，用户会以为坏了。
  const reviewGateReason = (() => {
    if (hasBuildArtifacts) return null;
    if (buildError) return `最近一次构建失败：${buildError}`;
    if (buildResult === null)
      return "还没有构建结果。「审查产物」需要一次正式构建产出的校验报告——试运行只写构建计划，不产出报告与补丁包。";
    if (buildResult.dry_run)
      return "最近一次是试运行：它只写构建计划，不产出校验报告与补丁包，所以这一步没法审查。";
    return "最近一次构建没有产出可审查的产物。";
  })();

  const reviewGateAction =
    jobIds.length > 0 || buildAll
      ? "继续的做法：取消勾选上面的「先试运行，不改任何文件」，再点「开始构建」；构建完成后这一步就会亮起。"
      : "当前向导没有待构建的坐骑。回到第 ⑥ 步选择坐骑，或到下方「已有批次」列表对目标批次点「重建」。";

  return (
    <div className="space-y-4">
      {showingIncoming && incomingJobIds && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
          <PackagePlus className="h-3.5 w-3.5" />
          已从资源管理带入 {incomingJobIds.length} 个补丁任务，直接进入构建步骤。
          <button
            type="button"
            className="ml-auto flex items-center gap-1 font-normal hover:underline"
            onClick={onBackToSelection}
          >
            <ArrowLeft className="h-3 w-3" />
            重新选择坐骑
          </button>
        </div>
      )}

      {handoverCount !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
          <PackagePlus className="h-3.5 w-3.5" />
          已从下方批次列表带入 {handoverCount} 个补丁任务，直接进入构建步骤。
          <button
            type="button"
            className="ml-auto flex items-center gap-1 font-normal hover:underline"
            onClick={onBackToSelection}
          >
            <ArrowLeft className="h-3 w-3" />
            重新选择坐骑
          </button>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-xs font-semibold text-text-secondary">
          构建范围
        </legend>

        <ScopeOption
          checked={!buildAll}
          onChange={() => onBuildAllChange(false)}
          title={`本次选中的 ${jobIds.length} 只坐骑`}
          description={
            jobIds.length > 0
              ? jobIds
                  .map((jobId) => jobNameById.get(jobId) ?? jobId)
                  .join("、")
              : "尚未选择坐骑"
          }
          disabled={jobIds.length === 0}
        />

        <ScopeOption
          checked={buildAll}
          onChange={() => onBuildAllChange(true)}
          title={`全部待处理任务（${allPendingCount} 只）`}
          description="忽略本次选择，处理工作区里所有还没发布的补丁任务"
          danger={allPendingCount > 10}
        />

        {buildAll && allPendingCount > 10 && (
          <div className="ml-6 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            这会重建 {allPendingCount} 只坐骑的 DBC 记录。
            如果只是想验证本次改动，请取消勾选，改用上面的「本次选中的坐骑」。
          </div>
        )}
      </fieldset>

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => onDryRunChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
        />
        <span>
          <span className="text-text-primary">先试运行，不改任何文件</span>
          <span className="ml-2 text-xs text-text-tertiary">
            只检查 ID 冲突并把构建计划写进任务目录，确认没问题后再正式构建
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={obfuscation === "basic"}
          onChange={(e) => onObfuscationChange(e.target.checked ? "basic" : "none")}
          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
        />
        <span>
          <span className="text-text-primary">生成混淆补丁包</span>
          <span className="ml-2 text-xs text-text-tertiary">
            打包后剥除档案内的文件清单（listfile），第三方工具无法枚举补丁内容；
            游戏客户端加载不受影响，混淆后不可逆
          </span>
        </span>
      </label>

      <details className="rounded-md border border-border bg-bg-surface px-3 py-2">
        <summary className="cursor-pointer text-xs text-text-secondary select-none">
          高级选项
        </summary>
        <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => onForceChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-500"
          />
          <span>
            <span className="text-danger">
              覆盖已存在的 DBC 记录
            </span>
            <span className="ml-2 text-xs text-text-tertiary">
              默认情况下，已经写入过的 DBC 记录会被跳过不受影响；
              勾选后会按计划强制重写。适用于「记录被写错了要重来」的情况。
            </span>
          </span>
        </label>
        {force && (
          <div className="mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            已勾选覆盖模式：本次构建会改写源 DBC 中已存在的记录，且不再生成
            新的 SQL 补丁。建议先在试运行模式下确认计划。
          </div>
        )}
      </details>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBuild}
          disabled={
            !canWrite ||
            building ||
            buildMutation.isPending ||
            (!buildAll && jobIds.length === 0)
          }
          title={canWrite ? undefined : "仅管理员可构建补丁"}
          className="btn btn-primary"
        >
          {building ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> 构建中...
            </>
          ) : (
            <>
              <Hammer className="h-4 w-4" />
              {dryRun ? "开始试运行" : "开始构建"}
            </>
          )}
        </button>
        <button
          type="button"
          className="btn"
          onClick={onBackToSelection}
        >
          上一步
        </button>
        <button
          type="button"
          className="btn"
          disabled={!hasBuildArtifacts}
          onClick={onNext}
          title={
            hasBuildArtifacts
              ? ""
              : buildResult?.dry_run
                ? "试运行不会生成校验报告，先正式构建再审查"
                : "先成功完成构建"
          }
        >
          下一步：审查产物
        </button>
      </div>

      {reviewGateReason && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <p>{reviewGateReason}</p>
              <p className="text-text-secondary">{reviewGateAction}</p>
              {buildResult?.dry_run && (jobIds.length > 0 || buildAll) && (
                <button
                  type="button"
                  className="btn btn-sm mt-1"
                  disabled={building || buildMutation.isPending}
                  onClick={onRealBuild}
                >
                  <Hammer className="h-3.5 w-3.5" />
                  跳过试运行，直接正式构建
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
        jobName={
          status?.progress.current_job
            ? (jobNameById.get(status.progress.current_job) ??
              status.progress.current_job)
            : undefined
        }
        progress={
          status?.progress ?? {
            current: 0,
            total: 0,
            current_job: null,
            phase: null,
            phase_label: null,
          }
        }
      />

      {buildSucceeded && (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <div className="font-semibold">
            {buildResult.dry_run
              ? "试运行完成"
              : "构建完成"}{" "}
            · 处理 {buildResult.jobs.length} 只坐骑 · 耗时{" "}
            {formatDuration(status?.started_at ?? null, status?.finished_at ?? null)}
          </div>
          <ul className="mt-1 space-y-0.5 text-text-secondary">
            <li>
              新增 SQL 补丁：{buildResult.sql_files.length} 个文件
            </li>
            {buildResult.mpq_path && (
              <li className="break-all">
                客户端补丁包：{buildResult.mpq_path}
              </li>
            )}
            {buildResult.obfuscation === "basic" && (
              <li>已启用 basic 混淆：档案内文件清单已剥除（不可逆）。</li>
            )}
            {buildResult.dry_run ? (
              <li>
                试运行没有修改任何文件。确认无误后，取消勾选「先试运行」
                再点「开始构建」，才会真正生成产物。
              </li>
            ) : (
              <li>
                产物已生成。下一步请到「审查产物」确认校验报告。
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
