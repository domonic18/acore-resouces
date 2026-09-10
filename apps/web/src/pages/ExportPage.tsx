import { useState } from "react";
import { ListChecks, Trash2 } from "lucide-react";
import { ExportWizard } from "@/features/resources/components/patch-export/ExportWizard";
import { JobAuditCard } from "@/features/resources/components/patch-export/JobAuditCard";
import { PatchBatchesTable } from "@/features/resources/components/patch-export/PatchBatchesTable";
import { CleanDialog } from "@/features/resources/components/patch-export/CleanDialog";
import { useBuildStatus } from "@/features/resources/hooks/usePatchBuild";

export function ExportPage() {
  const [auditJobId, setAuditJobId] = useState<string | null>(null);
  const [cleanOpen, setCleanOpen] = useState(false);
  const buildStatus = useBuildStatus();
  const building = buildStatus.data?.running ?? false;

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

      <ExportWizard />

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
          <PatchBatchesTable building={building} onAudit={setAuditJobId} />
        </div>
      </div>

      {auditJobId && (
        <JobAuditCard jobId={auditJobId} onClose={() => setAuditJobId(null)} />
      )}

      {cleanOpen && (
        <CleanDialog building={building} onClose={() => setCleanOpen(false)} />
      )}
    </div>
  );
}
