import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Hammer,
  Loader2,
  PackagePlus,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { MountMultiSelect } from "@/features/resources/components/patch-export/MountMultiSelect";
import { BuildLogView } from "@/features/resources/components/patch-export/BuildLogView";
import { ValidationReportView } from "@/features/resources/components/patch-export/ValidationReportView";
import { ArtifactList } from "@/features/resources/components/patch-export/ArtifactList";
import { useBuildStatus, usePatchBuild } from "@/features/resources/hooks/usePatchBuild";
import { usePatchExport } from "@/features/resources/hooks/usePatchExport";
import { usePatchPublish } from "@/features/resources/hooks/usePatchPublish";
import {
  useBatchValidationReport,
  useJobArtifacts,
  useJobValidationReport,
} from "@/features/resources/hooks/usePatchFlow";
import { useMountPatchJobs } from "@/features/resources/hooks/useMountPatchJobs";
import { useCanWrite } from "@/features/auth/useAuth";
import {
  WIZARD_FLOW_STEP_IDS,
  WIZARD_STEP_INDEX,
} from "@/features/resources/lib/patch-flow";

interface ScopeOptionProps {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  danger?: boolean;
  disabled?: boolean;
}

/** 构建范围的单选项：用单选而不是复选，避免两个范围同时生效的歧义。 */
function ScopeOption({
  checked,
  onChange,
  title,
  description,
  danger,
  disabled,
}: ScopeOptionProps) {
  return (
    <label
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        checked
          ? danger
            ? "border-warning/40 bg-warning/10"
            : "border-accent/40 bg-accent/10"
          : "border-border bg-bg-surface"
      } ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
      />
      <span className="min-w-0">
        <span
          className={
            danger ? "font-medium text-warning" : "font-medium text-text-primary"
          }
        >
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-text-tertiary">
          {description}
        </span>
      </span>
    </label>
  );
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  return ms >= 60_000
    ? `${(ms / 60_000).toFixed(1)} 分钟`
    : `${(ms / 1000).toFixed(1)} 秒`;
}

/**
 * 导出向导覆盖全流程的第 6~9 步：创建补丁任务 → 构建补丁 → 审查产物 → 发布补丁。
 *
 * 步骤序号沿用全流程编号（⑥⑦⑧⑨），让用户始终知道自己处在整条流程的哪个位置。
 */
export function ExportWizard({
  stepId,
  onStepChange,
  completed,
  onCompleted,
}: {
  /** 当前流程步骤 id（受控），由页面级流程上下文条持有 */
  stepId: string;
  /** 步骤变化回调（值为全流程步骤 id） */
  onStepChange: (stepId: string) => void;
  /** 是否已完成（显示完成页） */
  completed: boolean;
  /** 发布成功后切换到完成页 */
  onCompleted: () => void;
}) {
  // 内部步骤：0 选择坐骑 / 1 构建 / 2 审查 / 3 发布（完成态由 completed 表示）
  const step = WIZARD_STEP_INDEX[stepId] ?? 0;
  const canWrite = useCanWrite();
  const setStep = useCallback(
    (next: number) =>
      onStepChange(WIZARD_FLOW_STEP_IDS[next] ?? WIZARD_FLOW_STEP_IDS[0]),
    [onStepChange],
  );
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const [buildAll, setBuildAll] = useState(false);
  const [startNumber, setStartNumber] = useState(5);
  const [publishDryRun, setPublishDryRun] = useState(true);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // 从资源列表「导出补丁原料」跳转过来时带上任务 ID，直接进入构建步骤
  const incomingJobIds = useMemo(() => {
    const raw = searchParams.get("jobs");
    if (!raw) return null;
    const ids = raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return ids.length > 0 ? ids : null;
  }, [searchParams]);

  const buildStatus = useBuildStatus();
  const buildMutation = usePatchBuild();
  // 任务 ID → 坐骑名，用于把「mount_0466」显示成「幼年商队雷龙」
  const patchJobsQuery = useMountPatchJobs();
  const jobNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const job of patchJobsQuery.data ?? []) {
      map.set(job.job_id, job.resource_name || job.resource_model_folder);
    }
    return map;
  }, [patchJobsQuery.data]);
  // 任务 ID → 资源 ID，返回选择步骤时用来回填多选器
  const jobResourceIdById = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of patchJobsQuery.data ?? []) {
      map.set(job.job_id, job.resource_id);
    }
    return map;
  }, [patchJobsQuery.data]);
  // 可被构建的任务数（requested / generated / failed）
  const allPendingCount = useMemo(
    () =>
      (patchJobsQuery.data ?? []).filter((job) =>
        ["requested", "generated", "failed"].includes(job.status),
      ).length,
    [patchJobsQuery.data],
  );
  const exportMutation = usePatchExport();
  const publishMutation = usePatchPublish();

  const building = buildStatus.data?.running ?? false;
  const status = buildStatus.data;
  const buildResult = status?.result ?? null;
  const buildError = status?.error ?? null;
  const publishResult = publishMutation.data ?? null;

  // 审查步骤里聚焦的任务；与 jobIds 分开，避免污染构建范围
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const currentJobId = reviewJobId ?? (jobIds.length === 1 ? jobIds[0] : null);
  const validationQuery = useJobValidationReport(currentJobId);
  const artifactsQuery = useJobArtifacts(currentJobId);

  // 批次号从构建产物的 MPQ 路径推导，用于读取批次级校验报告与限定发布范围
  const batchId = buildResult?.mpq_path
    ? buildResult.mpq_path.split("/").slice(-2, -1)[0]
    : null;
  const batchValidationQuery = useBatchValidationReport(batchId);

  // 该任务是否查得到校验报告——由后端判定（登记路径 + 批次报告回退）。
  // 试运行与从未构建的任务没有报告，点进去只会撞 404，所以不给点击入口。
  const jobHasReport = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const job of patchJobsQuery.data ?? []) {
      map.set(job.job_id, job.has_validation_report);
    }
    return map;
  }, [patchJobsQuery.data]);

  useEffect(() => {
    if (status?.running) setStep(1);
  }, [status?.running, setStep]);

  // 承接资源列表带来的任务：填入构建范围并跳过选择步骤。
  // 只在首次到达时应用一次——否则用户点「重新选择坐骑」回到选择步骤时，
  // 依赖里的 stepId 变化会让这个 effect 再次触发并把人弹回构建步骤。
  const appliedIncomingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!incomingJobIds) return;
    const key = incomingJobIds.join(",");
    // 同一组任务只应用一次——否则用户点「重新选择坐骑」回到选择步骤时，
    // 依赖里的 stepId 变化会让这个 effect 再次触发并把人弹回构建步骤。
    if (appliedIncomingRef.current === key) return;
    appliedIncomingRef.current = key;
    setJobIds(incomingJobIds);
    if (stepId === "create-jobs") setStep(1);
  }, [incomingJobIds, stepId, setStep]);

  const buildSucceeded = buildResult !== null && buildError === null;
  // 试运行不落盘校验报告与产物——审查与发布都无从谈起，必须先正式构建。
  const hasBuildArtifacts =
    buildSucceeded && buildResult !== null && !buildResult.dry_run;

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
      : "当前向导没有待构建的坐骑。请在下方「补丁批次列表」里对目标批次点「重建」并选「正式构建」，或回到第 ① 步选择坐骑。";

  // 横幅只在「当前构建范围 == URL 带入的任务」时显示；
  // 用户重新选择并创建任务后，范围已变，就不该再声称是从资源列表带入的
  const showingIncoming =
    incomingJobIds !== null &&
    incomingJobIds.join(",") === jobIds.join(",");

  const handleCreateJobs = () => {
    if (selectedIds.length === 0) return;
    exportMutation.mutate(
      { resourceType: "mount", resourceIds: selectedIds },
      {
        onSuccess: (data) => {
          setJobIds(data.jobs.map((job) => job.job_id));
          setReviewJobId(null);
          setStep(1);
        },
      },
    );
  };

  /** 返回选择步骤，并把带入的任务对应的坐骑回填到多选器 */
  const handleBackToSelection = () => {
    const resourceIds = jobIds
      .map((jobId) => jobResourceIdById.get(jobId))
      .filter((id): id is number => id !== undefined);
    if (resourceIds.length > 0) setSelectedIds(resourceIds);
    setStep(0);
  };

  const handleBuild = () => {
    // 本批任务范围：默认只构建本次创建的任务；显式勾选才构建全部待处理任务
    const body = buildAll
      ? { all_requested: true, dry_run: dryRun, force }
      : { job_ids: jobIds, dry_run: dryRun, force };
    buildMutation.mutate(body);
  };

  /** 跳过试运行直接正式构建——审查产物的前置条件 */
  const handleRealBuild = () => {
    setDryRun(false);
    buildMutation.mutate(
      buildAll
        ? { all_requested: true, dry_run: false, force }
        : { job_ids: jobIds, dry_run: false, force },
    );
  };

  const handlePublish = () => {
    // 只发布本次构建出来的批次——全量发布会把 workspace/mpq/ 下
    // 遗留的历史批次也发出去，旧 DBC 会覆盖客户端的新 DBC。
    publishMutation.mutate(
      {
        start_number: startNumber,
        dry_run: publishDryRun,
        batch_ids: batchId ? [batchId] : undefined,
      },
      { onSuccess: () => onCompleted() },
    );
  };

  const handleReset = () => {
    setSelectedIds([]);
    setJobIds([]);
    setReviewJobId(null);
    setStep(0);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">制作补丁包</div>
          <div className="card-subtitle">
            全流程第 6~9 步：创建补丁任务 → 构建补丁 → 审查产物 → 发布补丁
          </div>
        </div>
      </div>
      <div className="card-body space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            <MountMultiSelect selected={selectedIds} onChange={setSelectedIds} />
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  !canWrite ||
                  selectedIds.length === 0 ||
                  exportMutation.isPending
                }
                title={canWrite ? undefined : "仅管理员可创建补丁任务"}
                onClick={handleCreateJobs}
              >
                {exportMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> 创建中...
                  </>
                ) : (
                  <>
                    <PackagePlus className="h-4 w-4" />
                    创建补丁任务 ({selectedIds.length})
                  </>
                )}
              </button>
              <span className="text-xs text-text-tertiary">
                创建后进入构建步骤；本次任务范围会带入构建，不会波及其它待处理任务。
              </span>
            </div>
            {exportMutation.isError && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {exportMutation.error instanceof Error
                  ? exportMutation.error.message
                  : "创建补丁任务失败"}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {showingIncoming && incomingJobIds && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
                <PackagePlus className="h-3.5 w-3.5" />
                已从资源列表带入 {incomingJobIds.length} 个补丁任务，直接进入构建步骤。
                <button
                  type="button"
                  className="ml-auto flex items-center gap-1 font-normal hover:underline"
                  onClick={handleBackToSelection}
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
                onChange={() => setBuildAll(false)}
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
                onChange={() => setBuildAll(true)}
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
                onChange={(e) => setDryRun(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
              />
              <span>
                <span className="text-text-primary">先试运行，不改任何文件</span>
                <span className="ml-2 text-xs text-text-tertiary">
                  只检查 ID 冲突并把构建计划写进任务目录，确认没问题后再正式构建
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
                  onChange={(e) => setForce(e.target.checked)}
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
                onClick={handleBuild}
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
                onClick={handleBackToSelection}
              >
                上一步
              </button>
              <button
                type="button"
                className="btn"
                disabled={!hasBuildArtifacts}
                onClick={() => setStep(2)}
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
                        onClick={handleRealBuild}
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
        )}

        {step === 2 && (
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
                      onClick={() => setReviewJobId(jobId)}
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
                      onClick={() => setReviewJobId(null)}
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
                onClick={() => setStep(3)}
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
              <button type="button" className="btn" onClick={() => setStep(1)}>
                上一步
              </button>
            </div>
          </div>
        )}

        {!completed && step === 3 && (
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
                      setStartNumber(Number(e.target.value) || 1)
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
                    onChange={(e) => setPublishDryRun(e.target.checked)}
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
                  onClick={handlePublish}
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
                <button type="button" className="btn" onClick={() => setStep(2)}>
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
        )}

        {completed && (
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
            <div className="rounded-md border border-border bg-bg-surface px-3 py-3 text-xs text-text-secondary">
              <div className="mb-2 font-semibold text-text-primary">
                还剩 4 步就真正上线（第 9 步）
              </div>
              <ol className="space-y-2">
                <li className="flex gap-2">
                  <span className="font-mono text-text-tertiary">1.</span>
                  <span>
                    <span className="text-text-primary">导入服务端 SQL</span>
                    <br />
                    <code className="font-mono text-text-primary">
                      data/sql/azerothcore-updates/mounts/
                    </code>{" "}
                    下的补丁需导入{" "}
                    <code className="font-mono text-text-primary">
                      acore_world
                    </code>
                    。该目录不在 AzerothCore 的更新追踪表里，
                    <b>worldserver 重启才会自动加载</b>
                    ，否则需手工导入
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-text-tertiary">2.</span>
                  <span>
                    <span className="text-text-primary">同步 DBC 到测试服</span>
                    <br />
                    <code className="font-mono text-text-primary">
                      bash acore-deploy/scripts/acore-update-dbc.sh --local-path
                      data/wow-dbc/src/dbc
                    </code>
                    ，并提交 data/wow-dbc 子模块的改动
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-text-tertiary">3.</span>
                  <span>
                    <span className="text-text-primary">部署客户端</span>
                    <br />
                    把上面列出的 MPQ 复制到客户端{" "}
                    <code className="font-mono text-text-primary">
                      World of Warcraft/Data/
                    </code>
                    ，删除 <code className="font-mono">Data/cache/</code>{" "}
                    后重启客户端。补丁编号必须大于客户端已有的最大编号
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-text-tertiary">4.</span>
                  <span>
                    <span className="text-text-primary">实测并标记上线</span>
                    <br />
                    在资源详情页确认模型、召唤与特性都正常，勾选「调试通过」与
                    「已添加」后保存——这两个标记是流程第 9 步的完成判据
                  </span>
                </li>
              </ol>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="btn" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" /> 再制作一批
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => navigate("/resources?type=mount")}
              >
                去资源列表勾选「调试通过」
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
