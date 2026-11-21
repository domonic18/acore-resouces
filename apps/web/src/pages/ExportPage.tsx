import { useCallback, useState } from "react";
import { ListChecks, Trash2 } from "lucide-react";
import { ExportWizard } from "@/features/resources/components/patch-export/ExportWizard";
import { FlowContextBar } from "@/features/resources/components/patch-export/FlowContextBar";
import { JobAuditCard } from "@/features/resources/components/patch-export/JobAuditCard";
import { ValidationReportDialog } from "@/features/resources/components/patch-export/ValidationReportDialog";
import { PatchBatchesTable } from "@/features/resources/components/patch-export/PatchBatchesTable";
import { CleanDialog } from "@/features/resources/components/patch-export/CleanDialog";
import { useBuildStatus } from "@/features/resources/hooks/usePatchBuild";
import { WIZARD_FLOW_STEP_IDS } from "@/features/resources/lib/patch-flow";

export function ExportPage() {
  const [auditJobId, setAuditJobId] = useState<string | null>(null);
  const [cleanOpen, setCleanOpen] = useState(false);
  // 当前所处流程步骤与完成态由页面持有——流程上下文条与向导共用同一份状态
  const [flowStepId, setFlowStepId] = useState<string>(
    WIZARD_FLOW_STEP_IDS[0],
  );
  const [completed, setCompleted] = useState(false);
  // 校验报告查看目标：批次号或任务 ID
  const [validationTarget, setValidationTarget] = useState<{
    batchId?: string;
    jobId?: string;
  } | null>(null);
  const buildStatus = useBuildStatus();
  const building = buildStatus.data?.running ?? false;

  const handleStepChange = useCallback((stepId: string) => {
    setFlowStepId(stepId);
    setCompleted(false);
  }, []);

  const handleCompleted = useCallback(() => {
    setCompleted(true);
  }, []);

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">导出补丁</h1>
        <div className="topbar-actions">
          <span className="text-xs text-text-tertiary">
            第一阶段仅支持坐骑资源
          </span>
        </div>
      </header>

      <div className="card mb-4">
        <div className="card-body py-2.5">
          <FlowContextBar
            currentStepId={flowStepId}
            interactiveStepIds={[...WIZARD_FLOW_STEP_IDS]}
            onStepSelect={handleStepChange}
          />
        </div>
      </div>

      <ExportWizard
        stepId={flowStepId}
        onStepChange={handleStepChange}
        completed={completed}
        onCompleted={handleCompleted}
      />

      <div className="card mt-6">
        <div className="card-header">
          <div>
            <div className="card-title flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> 补丁批次列表
            </div>
            <div className="card-subtitle">
              按导出批次聚合：坐骑数、补丁包与产物路径；展开查看每只坐骑的 DBC/SQL 变更
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setCleanOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> 清理工作区
          </button>
        </div>
        <div className="card-body">
          <PatchBatchesTable
            building={building}
            onAudit={setAuditJobId}
            onShowValidation={setValidationTarget}
          />
        </div>
      </div>

      {auditJobId && (
        <JobAuditCard jobId={auditJobId} onClose={() => setAuditJobId(null)} />
      )}

      {validationTarget && (
        <ValidationReportDialog
          open
          onClose={() => setValidationTarget(null)}
          batchId={validationTarget.batchId}
          jobId={validationTarget.jobId}
        />
      )}

      {cleanOpen && (
        <CleanDialog building={building} onClose={() => setCleanOpen(false)} />
      )}
    </div>
  );
}
