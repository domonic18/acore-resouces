import { Dialog } from "@/shared/components/ui/Dialog";
import { ValidationReportView } from "@/features/resources/components/patch-export/ValidationReportView";
import {
  useBatchValidationReport,
  useJobValidationReport,
} from "@/features/resources/hooks/usePatchFlow";
import { Loader2 } from "lucide-react";

interface ValidationReportDialogProps {
  open: boolean;
  onClose: () => void;
  /** 批次号（批次级报告） */
  batchId?: string;
  /** 任务 ID（单任务报告切片） */
  jobId?: string;
}

/** 校验报告查看对话框：批次级与任务级共用。 */
export function ValidationReportDialog({
  open,
  onClose,
  batchId,
  jobId,
}: ValidationReportDialogProps) {
  const batchQuery = useBatchValidationReport(batchId ?? null);
  const jobQuery = useJobValidationReport(jobId ?? null);
  const query = batchId ? batchQuery : jobQuery;
  const report = query.data;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="校验报告"
      subtitle={
        batchId
          ? `批次 ${batchId}`
          : jobId
            ? `任务 ${jobId}`
            : undefined
      }
      size="lg"
    >
      {query.isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在读取校验报告...
        </div>
      )}

      {query.isError && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          读取校验报告失败：
          {query.error instanceof Error
            ? query.error.message
            : "未知错误"}
        </div>
      )}

      {report && (
        <ValidationReportView report={report} jobId={jobId} />
      )}
    </Dialog>
  );
}
