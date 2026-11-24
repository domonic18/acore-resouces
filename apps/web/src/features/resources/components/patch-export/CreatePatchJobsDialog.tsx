import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { Dialog } from "@/shared/components/ui/Dialog";
import { Badge } from "@/shared/components/ui/Badge";
import { usePatchPreflight } from "@/features/resources/hooks/usePatchPreflight";
import type { Resource } from "@/shared/types";

interface CreatePatchJobsDialogProps {
  open: boolean;
  onClose: () => void;
  /** 选中的坐骑（至少一只） */
  resources: Resource[];
}

/**
 * 「去制作补丁」确认对话框：只读预检 + 跳转向导。
 *
 * 入口唯一原则：这里不再创建补丁任务，只做预检提示；确认后带着勾选的
 * 坐骑 ID 跳到「导出补丁」页向导第⑥步（?select= 预填），任务的真正创建
 * 统一发生在向导里的「创建补丁任务」按钮上。
 */
export function CreatePatchJobsDialog({
  open,
  onClose,
  resources,
}: CreatePatchJobsDialogProps) {
  const navigate = useNavigate();

  const resourceIds = useMemo(
    () => resources.map((resource) => resource.id),
    [resources],
  );

  const preflight = usePatchPreflight(resourceIds, open);

  const goWizard = () => {
    if (resourceIds.length === 0) return;
    navigate(`/export?select=${encodeURIComponent(resourceIds.join(","))}`);
    onClose();
  };

  const summaries = preflight.data;
  const blocked = summaries
    ? [...summaries.values()].filter((item) => !item.ready)
    : [];
  const blockedCount = blocked.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="去制作补丁"
      subtitle="制作补丁统一在「导出补丁」页的向导里进行；确认后跳到第⑥步，勾选的坐骑会预填进选择列表"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={goWizard}
            disabled={resourceIds.length === 0 || preflight.isLoading}
          >
            去制作补丁（{resourceIds.length} 只）
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="text-sm text-text-secondary">
          将带着以下 {resources.length} 只坐骑进入补丁向导：
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>坐骑</th>
                <th style={{ width: 160 }}>预检</th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => {
                const summary = summaries?.get(resource.id);
                return (
                  <tr key={resource.id}>
                    <td>
                      <span className="font-mono text-xs text-text-tertiary">
                        {String(resource.id).padStart(4, "0")}
                      </span>
                      <span className="ml-2 text-text-primary">
                        {resource.name || resource.model_folder}
                      </span>
                    </td>
                    <td>
                      {preflight.isLoading ? (
                        <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          预检中...
                        </span>
                      ) : !summary ? (
                        <span className="text-xs text-text-tertiary">—</span>
                      ) : summary.ready ? (
                        <Badge tone="success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          预检通过
                        </Badge>
                      ) : (
                        <Badge tone="danger">
                          <XCircle className="mr-1 h-3 w-3" />
                          {summary.errorCount} 个错误
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {blockedCount > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {blockedCount} 只坐骑预检未通过
            </div>
            <ul className="space-y-0.5 text-text-secondary">
              {blocked.map((item) => {
                const resource = resources.find(
                  (r) => r.id === item.resourceId,
                );
                return (
                  <li key={item.resourceId}>
                    <span className="text-text-primary">
                      {resource?.name || resource?.model_folder}
                    </span>
                    ：{item.missingFields.length > 0
                      ? `缺少必填字段 ${item.missingFields.join("、")}`
                      : item.headline}
                  </li>
                );
              })}
            </ul>
            <div className="mt-1 text-text-tertiary">
              可以先进入向导，但构建时会失败——建议先补全后再制作。
            </div>
          </div>
        )}

        {preflight.isError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            预检失败：
            {preflight.error instanceof Error
              ? preflight.error.message
              : "未知错误"}
          </div>
        )}
      </div>
    </Dialog>
  );
}
