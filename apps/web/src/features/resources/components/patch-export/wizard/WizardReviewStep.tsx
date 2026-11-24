import { ClipboardCheck } from "lucide-react";
import { ValidationReportView } from "@/features/resources/components/patch-export/ValidationReportView";
import { ArtifactList } from "@/features/resources/components/patch-export/ArtifactList";
import type { WizardReviewStepProps } from "./types";

/** 向导第 2 步（全流程第 ⑧ 步）：审查构建产物的校验报告与产物清单。 */
export function WizardReviewStep({
  jobIds,
  jobHasReport,
  currentJobId,
  onSelectJob,
  onClearSelectedJob,
  validationQuery,
  batchValidationQuery,
  artifactsQuery,
  hasBuildArtifacts,
  buildResult,
  onNext,
  onBack,
}: WizardReviewStepProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <ClipboardCheck className="h-4 w-4" />
        审查本次构建产物的校验结果，确认后再发布。
      </div>

      {!hasBuildArtifacts && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {buildResult?.dry_run
            ? "最近一次是试运行——试运行不产出校验报告，也没有补丁包。请回到「构建补丁」取消勾选「先试运行」后正式构建。"
            : "还没有可供审查的构建产物。请先到「构建补丁」步骤完成一次正式构建。"}
        </div>
      )}

      {jobIds.length > 1 ? (
        <div className="rounded-md border border-border bg-bg-surface px-3 py-2 text-xs text-text-tertiary">
          本批共 {jobIds.length} 个任务。点击任务查看其详细校验报告：
          {jobIds.map((jobId) =>
            jobHasReport.get(jobId) === false ? (
              <span
                key={jobId}
                className="ml-2 font-mono text-text-tertiary"
                title="该任务没有校验报告——它从未成功构建过（试运行不产出报告）"
              >
                {jobId}（未构建）
              </span>
            ) : (
              <button
                key={jobId}
                type="button"
                className="ml-2 font-mono text-accent hover:underline"
                onClick={() => onSelectJob(jobId)}
              >
                {jobId}
              </button>
            ),
          )}
        </div>
      ) : null}

      {currentJobId && validationQuery.data && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
            任务 {currentJobId} 的校验报告
            {jobIds.length > 1 && (
              <button
                type="button"
                className="font-normal text-accent hover:underline"
                onClick={onClearSelectedJob}
              >
                返回批次总览
              </button>
            )}
          </div>
          <ValidationReportView
            report={validationQuery.data}
            jobId={currentJobId}
          />
        </div>
      )}

      {!currentJobId && batchValidationQuery.data && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-text-secondary">
            批次校验总览
          </div>
          <ValidationReportView report={batchValidationQuery.data} />
        </div>
      )}

      {validationQuery.isError && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          读取校验报告失败：
          {validationQuery.error instanceof Error
            ? validationQuery.error.message
            : "未知错误"}
          {currentJobId && (
            <div className="mt-1 text-text-secondary">
              该任务没有校验报告——它可能没被构建过（试运行不产出报告），
              或构建记录已被重新创建覆盖。重新构建后再试。
            </div>
          )}
        </div>
      )}

      {artifactsQuery.data && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-text-secondary">
            产物清单
          </div>
          <ArtifactList artifacts={artifactsQuery.data} />
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasBuildArtifacts}
          onClick={onNext}
          title={
            hasBuildArtifacts
              ? ""
              : buildResult?.dry_run
                ? "试运行没有产出补丁包，先正式构建再发布"
                : "先成功完成构建"
          }
        >
          下一步：发布补丁
        </button>
        <button type="button" className="btn" onClick={onBack}>
          上一步
        </button>
      </div>
    </div>
  );
}
