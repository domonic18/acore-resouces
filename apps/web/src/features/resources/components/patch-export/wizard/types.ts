import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { PatchBuildRequest } from "@/shared/patches";
import type {
  BuildStatus,
  JobArtifactsOut,
  PatchBuildResult,
  PatchExportResponse,
  PublishResult,
  ValidationReportOut,
} from "@/shared/types";

/* ---------- TanStack Query 结果别名 ----------
 * mutation / useQuery 的调用全部留在 ExportWizard 编排骨架里，
 * 各 Step 组件只通过 props 消费结果，保证 hook 调用顺序与行为不变。
 */

/** 创建补丁任务的 mutation 结果（usePatchExport） */
export type ExportJobsMutation = UseMutationResult<
  PatchExportResponse,
  Error,
  { resourceType: string; resourceIds: number[] }
>;

/** 启动构建的 mutation 结果（usePatchBuild） */
export type BuildMutation = UseMutationResult<
  { started: boolean },
  Error,
  PatchBuildRequest
>;

/** 发布补丁的 mutation 结果（usePatchPublish） */
export type PublishMutation = UseMutationResult<
  PublishResult,
  Error,
  { start_number?: number; dry_run?: boolean; batch_ids?: string[] }
>;

/** 校验报告查询结果（任务级与批次级共用，useJobValidationReport / useBatchValidationReport） */
export type ValidationReportQuery = UseQueryResult<ValidationReportOut, Error>;

/** 任务产物清单查询结果（useJobArtifacts） */
export type JobArtifactsQuery = UseQueryResult<JobArtifactsOut, Error>;

/* ---------- 各步骤组件的 props ---------- */

export interface ScopeOptionProps {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  danger?: boolean;
  disabled?: boolean;
}

export interface WizardSelectStepProps {
  /** 已勾选的资源 ID（受控） */
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  canWrite: boolean;
  exportMutation: ExportJobsMutation;
  onCreateJobs: () => void;
}

export interface WizardBuildStepProps {
  canWrite: boolean;
  /** 从资源列表「导出补丁原料」跳转带入的任务 ID；无带入时为 null */
  incomingJobIds: string[] | null;
  /** 当前构建范围 == URL 带入的任务时才显示带入横幅 */
  showingIncoming: boolean;
  /** 本次创建的任务 ID 范围 */
  jobIds: string[];
  /** 任务 ID → 坐骑名，用于把「mount_0466」显示成「幼年商队雷龙」 */
  jobNameById: Map<string, string>;
  /** 可被构建的任务数（requested / generated / failed） */
  allPendingCount: number;
  dryRun: boolean;
  onDryRunChange: (value: boolean) => void;
  force: boolean;
  onForceChange: (value: boolean) => void;
  /** MPQ 混淆等级；basic 在打包后剥除档案内内容清单（不可逆） */
  obfuscation: "none" | "basic";
  onObfuscationChange: (value: "none" | "basic") => void;
  buildAll: boolean;
  onBuildAllChange: (value: boolean) => void;
  /** 构建是否正在进行（轮询状态） */
  building: boolean;
  buildMutation: BuildMutation;
  /** 构建轮询状态本体（日志 / 进度 / 起止时间） */
  status: BuildStatus | undefined;
  /** 最近一次构建结果（无结果时为 null） */
  buildResult: PatchBuildResult | null;
  /** 最近一次构建的错误信息 */
  buildError: string | null;
  /** 最近一次为正式构建且成功——审查与发布的前置条件 */
  hasBuildArtifacts: boolean;
  onBuild: () => void;
  /** 跳过试运行直接正式构建 */
  onRealBuild: () => void;
  onBackToSelection: () => void;
  onNext: () => void;
}

export interface WizardReviewStepProps {
  jobIds: string[];
  /** 任务 ID → 是否查得到校验报告（由后端判定，试运行与未构建任务没有报告） */
  jobHasReport: Map<string, boolean>;
  /** 当前聚焦审查的任务；null 表示批次总览 */
  currentJobId: string | null;
  onSelectJob: (jobId: string) => void;
  onClearSelectedJob: () => void;
  validationQuery: ValidationReportQuery;
  batchValidationQuery: ValidationReportQuery;
  artifactsQuery: JobArtifactsQuery;
  hasBuildArtifacts: boolean;
  buildResult: PatchBuildResult | null;
  onNext: () => void;
  onBack: () => void;
}

export interface WizardPublishStepProps {
  canWrite: boolean;
  startNumber: number;
  onStartNumberChange: (value: number) => void;
  publishDryRun: boolean;
  onPublishDryRunChange: (value: boolean) => void;
  publishMutation: PublishMutation;
  publishResult: PublishResult | null;
  onPublish: () => void;
  onBack: () => void;
}

export interface WizardCompletedViewProps {
  status: BuildStatus | undefined;
  buildResult: PatchBuildResult | null;
  buildError: string | null;
  publishResult: PublishResult | null;
  onReset: () => void;
  onGoToResources: () => void;
}
