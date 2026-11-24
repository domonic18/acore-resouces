import type { PatchBatch, PatchBatchJob } from "@/shared/types";

/** 打开校验报告：传批次号或任务 ID */
export interface ShowValidationTarget {
  batchId?: string;
  jobId?: string;
}

export interface BatchCardProps {
  batch: PatchBatch;
  isOpen: boolean;
  sqlCount: number;
  building: boolean;
  onToggle: () => void;
  onAudit: (jobId: string) => void;
  onDelete: (job: PatchBatchJob) => void;
  onShowValidation: (target: ShowValidationTarget) => void;
  onRebuild: (batch: PatchBatch) => void;
  onPublish: (batch: PatchBatch) => void;
  onDeleteBatch: (batch: PatchBatch) => void;
}

export interface BatchDetailProps {
  batch: PatchBatch;
  building: boolean;
  onAudit: (jobId: string) => void;
  onDelete: (job: PatchBatchJob) => void;
  onShowValidation: (target: ShowValidationTarget) => void;
}
