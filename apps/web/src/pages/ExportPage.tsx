import { useState } from "react";
import { Hammer, ListChecks, PackagePlus, Trash2, UploadCloud } from "lucide-react";
import { MountMultiSelect } from "@/features/resources/components/patch-export/MountMultiSelect";
import { BuildPanel } from "@/features/resources/components/patch-export/BuildPanel";
import { JobAuditCard } from "@/features/resources/components/patch-export/JobAuditCard";
import { PublishPanel } from "@/features/resources/components/patch-export/PublishPanel";
import { PatchBatchesTable } from "@/features/resources/components/patch-export/PatchBatchesTable";
import { CleanDialog } from "@/features/resources/components/patch-export/CleanDialog";
import { BulkPatchExportButton } from "@/features/resources/components/BulkPatchExportButton";
import { useBuildStatus } from "@/features/resources/hooks/usePatchBuild";

export function ExportPage() {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
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

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title flex items-center gap-2">
              <PackagePlus className="h-4 w-4" /> 创建导出任务
            </div>
            <div className="card-subtitle">
              选择坐骑生成补丁任务（仅写任务元数据，构建时现场读取真相源）
            </div>
          </div>
        </div>
        <div className="card-body">
          <MountMultiSelect selected={selectedIds} onChange={setSelectedIds} />
          <div className="mt-4">
            <BulkPatchExportButton
              resourceType="mount"
              resourceIds={selectedIds}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title flex items-center gap-2">
                <Hammer className="h-4 w-4" /> 构建
              </div>
              <div className="card-subtitle">
                处理全部待构建任务，生成 DBC 修改 / SQL 补丁 / MPQ
              </div>
            </div>
          </div>
          <div className="card-body">
            <BuildPanel />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title flex items-center gap-2">
                <UploadCloud className="h-4 w-4" /> 发布
              </div>
              <div className="card-subtitle">
                将 workspace/mpq/ 下未发布的批次复制到分发目录
              </div>
            </div>
          </div>
          <div className="card-body">
            <PublishPanel />
          </div>
        </div>
      </div>

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
