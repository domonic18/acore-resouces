import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useBuildStatus, usePatchBuild } from "@/features/resources/hooks/usePatchBuild";
import { usePatchExport } from "@/features/resources/hooks/usePatchExport";
import { usePatchPublish } from "@/features/resources/hooks/usePatchPublish";
import { useBatchValidationReport, useJobArtifacts, useJobValidationReport } from "@/features/resources/hooks/usePatchFlow";
import { useMountPatchJobs } from "@/features/resources/hooks/useMountPatchJobs";
import { useCanWrite } from "@/features/auth/useAuth";
import { StepIndicator } from "@/shared/components/ui/StepIndicator";
import {
  getWizardFlowSteps,
  WIZARD_FLOW_STEP_IDS,
  WIZARD_STEP_INDEX,
} from "@/features/resources/lib/patch-flow";
import { WizardSelectStep } from "./wizard/WizardSelectStep";
import { WizardBuildStep } from "./wizard/WizardBuildStep";
import { WizardReviewStep } from "./wizard/WizardReviewStep";
import { WizardPublishStep } from "./wizard/WizardPublishStep";
import { WizardCompletedView } from "./wizard/WizardCompletedView";
import type { WizardHandover } from "./wizard/types";

/** 向导四个步骤的展示数据（全流程编号 ⑥~⑨），只取一次即可 */
const WIZARD_INDICATOR_STEPS = getWizardFlowSteps();

/**
 * 导出向导覆盖全流程的第 6~9 步：创建补丁任务 → 构建补丁 → 审查产物 → 发布补丁。
 * 本组件是编排骨架：持有全部状态与 mutation/useQuery 调用（顺序不可变动），
 * 各步骤的呈现拆在 ./wizard/ 下的 Step 组件里，经 props 透传。
 * 步骤序号沿用全流程编号（⑥⑦⑧⑨），完成态由 completed 表示。
 */
export function ExportWizard({
  stepId,
  onStepChange,
  completed,
  onCompleted,
  handover,
  onHandoverConsumed,
}: {
  /** 当前流程步骤 id（受控），由页面级流程上下文条持有 */
  stepId: string;
  /** 步骤变化回调（值为全流程步骤 id） */
  onStepChange: (stepId: string) => void;
  /** 是否已完成（显示完成页） */
  completed: boolean;
  /** 发布成功后切换到完成页 */
  onCompleted: () => void;
  /** 批次列表「重建」带入的任务范围；消费后由页面置 null */
  handover: WizardHandover | null;
  /** 向导已承接 handover 后通知页面清空 */
  onHandoverConsumed: () => void;
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
  const [obfuscation, setObfuscation] = useState<"none" | "basic">("none");
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
    // 发布步进行中不被抢跳：后台若有别的构建在跑，用户不该被从发布页拽走
    if (status?.running && step !== 3) setStep(1);
  }, [status?.running, step, setStep]);

  // 承接资源列表带来的任务：填入构建范围并跳过选择步骤。
  // 只在首次到达时应用一次——否则用户点「重新选择坐骑」回到选择步骤时，
  // 依赖里的 stepId 变化会让这个 effect 再次触发并把人弹回构建步骤。
  const appliedIncomingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!incomingJobIds) return;
    const key = incomingJobIds.join(",");
    if (appliedIncomingRef.current === key) return;
    appliedIncomingRef.current = key;
    setJobIds(incomingJobIds);
    if (stepId === "create-jobs") setStep(1);
  }, [incomingJobIds, stepId, setStep]);

  // 承接批次列表「重建」带来的任务：同样跳到构建步骤。
  // handover 在承接后即被页面置 null，不需要 ref 防重放；
  // 记录承接结果（handoverJobIds）用于构建步的来源横幅。
  const [handoverJobIds, setHandoverJobIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!handover) return;
    setHandoverJobIds(handover.jobIds);
    setJobIds(handover.jobIds);
    setBuildAll(false);
    setStep(1);
    onHandoverConsumed();
  }, [handover, onHandoverConsumed, setStep]);

  // 试运行不落盘校验报告与产物——审查与发布都无从谈起，必须先正式构建。
  const hasBuildArtifacts =
    buildResult !== null && buildError === null && !buildResult.dry_run;

  // 横幅只在「当前构建范围 == URL 带入的任务」时显示；用户重新选择并创建任务后，范围已变，就不该再声称是从资源列表带入的
  const showingIncoming =
    incomingJobIds !== null && incomingJobIds.join(",") === jobIds.join(",");
  // 批次列表「重建」带入的来源横幅，显示条件同理
  const showingHandover =
    handoverJobIds !== null &&
    handoverJobIds.length > 0 &&
    handoverJobIds.join(",") === jobIds.join(",");

  const handleCreateJobs = () => {
    if (selectedIds.length === 0) return;
    exportMutation.mutate(
      { resourceType: "mount", resourceIds: selectedIds },
      {
        onSuccess: (data) => {
          setJobIds(data.jobs.map((job) => job.job_id));
          setHandoverJobIds(null);
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
      ? { all_requested: true, dry_run: dryRun, force, obfuscation }
      : { job_ids: jobIds, dry_run: dryRun, force, obfuscation };
    buildMutation.mutate(body);
  };

  /** 跳过试运行直接正式构建——审查产物的前置条件 */
  const handleRealBuild = () => {
    setDryRun(false);
    buildMutation.mutate(
      buildAll
        ? { all_requested: true, dry_run: false, force, obfuscation }
        : { job_ids: jobIds, dry_run: false, force, obfuscation },
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
    setHandoverJobIds(null);
    setReviewJobId(null);
    setStep(0);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="space-y-2.5">
          <div>
            <div className="card-title">制作补丁包</div>
            <div className="card-subtitle">
              ①~⑤ 的资源准备在「资源管理」页完成；右侧批次列表的「重建」也会汇入这条向导
            </div>
          </div>
          <StepIndicator
            steps={WIZARD_INDICATOR_STEPS}
            current={completed ? WIZARD_INDICATOR_STEPS.length : step}
            onSelect={!completed ? setStep : undefined}
          />
        </div>
      </div>
      <div className="card-body space-y-4">
        {step === 0 && (
          <WizardSelectStep
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            canWrite={canWrite}
            exportMutation={exportMutation}
            onCreateJobs={handleCreateJobs}
          />
        )}

        {step === 1 && (
          <WizardBuildStep
            canWrite={canWrite}
            incomingJobIds={incomingJobIds}
            showingIncoming={showingIncoming}
            handoverCount={showingHandover ? handoverJobIds.length : null}
            jobIds={jobIds}
            jobNameById={jobNameById}
            allPendingCount={allPendingCount}
            dryRun={dryRun}
            onDryRunChange={setDryRun}
            force={force}
            onForceChange={setForce}
            obfuscation={obfuscation}
            onObfuscationChange={setObfuscation}
            buildAll={buildAll}
            onBuildAllChange={setBuildAll}
            building={building}
            buildMutation={buildMutation}
            status={status}
            buildResult={buildResult}
            buildError={buildError}
            hasBuildArtifacts={hasBuildArtifacts}
            onBuild={handleBuild}
            onRealBuild={handleRealBuild}
            onBackToSelection={handleBackToSelection}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <WizardReviewStep
            jobIds={jobIds}
            jobHasReport={jobHasReport}
            currentJobId={currentJobId}
            onSelectJob={setReviewJobId}
            onClearSelectedJob={() => setReviewJobId(null)}
            validationQuery={validationQuery}
            batchValidationQuery={batchValidationQuery}
            artifactsQuery={artifactsQuery}
            hasBuildArtifacts={hasBuildArtifacts}
            buildResult={buildResult}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {!completed && step === 3 && (
          <WizardPublishStep
            canWrite={canWrite}
            startNumber={startNumber}
            onStartNumberChange={setStartNumber}
            publishDryRun={publishDryRun}
            onPublishDryRunChange={setPublishDryRun}
            publishMutation={publishMutation}
            publishResult={publishResult}
            onPublish={handlePublish}
            onBack={() => setStep(2)}
          />
        )}
        {completed && (
          <WizardCompletedView
            status={status}
            buildResult={buildResult}
            buildError={buildError}
            publishResult={publishResult}
            onReset={handleReset}
            onGoToResources={() => navigate("/resources?type=mount")}
          />
        )}
      </div>
    </div>
  );
}
