import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  XCircle,
} from "lucide-react";
import { Dialog } from "@/shared/components/ui/Dialog";
import { Badge } from "@/shared/components/ui/Badge";
import { usePatchPreflight } from "@/features/resources/hooks/usePatchPreflight";
import { usePatchExport } from "@/features/resources/hooks/usePatchExport";
import type { Resource } from "@/shared/types";

interface CreatePatchJobsDialogProps {
  open: boolean;
  onClose: () => void;
  /** 选中的坐骑（至少一只） */
  resources: Resource[];
}

/**
 * 创建补丁任务对话框（生产流程第 6 步）。
 *
 * 两态：
 * - 确认态：列出将要创建的坐骑 + 每只的预检结果，说明后续流程；
 * - 成功态：给出任务 ID 与「继续构建」入口。
 *
 * 关键点：这一步只是流程的**起点**，界面必须明确告诉用户接下来做什么，
 * 不能在任务 ID 上一断了之。
 */
export function CreatePatchJobsDialog({
  open,
  onClose,
  resources,
}: CreatePatchJobsDialogProps) {
  const [createdJobIds, setCreatedJobIds] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const mutation = usePatchExport();

  const resourceIds = useMemo(
    () => resources.map((resource) => resource.id),
    [resources],
  );

  // 只有确认态才需要预检；成功态不再请求
  const preflight = usePatchPreflight(resourceIds, open && !createdJobIds);

  // 打开时重置到确认态
  useEffect(() => {
    if (open) {
      setCreatedJobIds(null);
      setCopied(false);
    }
  }, [open]);

  const handleCreate = () => {
    if (resourceIds.length === 0) return;
    mutation.mutate(
      { resourceType: "mount", resourceIds },
      {
        onSuccess: (data) => {
          setCreatedJobIds(data.jobs.map((job) => job.job_id));
        },
      },
    );
  };

  const handleCopy = async () => {
    if (!createdJobIds) return;
    await navigator.clipboard.writeText(createdJobIds.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const goToBuild = () => {
    if (!createdJobIds?.length) return;
    navigate(`/export?jobs=${encodeURIComponent(createdJobIds.join(","))}`);
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
      title={createdJobIds ? "补丁任务已创建" : "创建补丁任务"}
      subtitle={
        createdJobIds
          ? "接下来还需三步：构建补丁 → 审查产物 → 发布补丁"
          : "生产流程第 6 步 · 创建后可直接进入构建"
      }
      size="lg"
      footer={
        createdJobIds ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-sm"
              onClick={onClose}
            >
              稍后处理
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={goToBuild}
            >
              继续构建补丁
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-sm"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleCreate}
              disabled={
                mutation.isPending ||
                resourceIds.length === 0 ||
                preflight.isLoading
              }
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  创建中...
                </>
              ) : (
                `创建 ${resourceIds.length} 个补丁任务`
              )}
            </button>
          </div>
        )
      }
    >
      {createdJobIds ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">
              已为 {resources.length} 只坐骑创建补丁任务
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-surface px-3 py-2">
            {createdJobIds.map((jobId) => (
              <span key={jobId} className="font-mono text-xs text-text-primary">
                {jobId}
              </span>
            ))}
            <button
              type="button"
              className="btn btn-icon btn-sm btn-ghost ml-auto"
              onClick={handleCopy}
              title="复制任务 ID"
              aria-label="复制任务 ID"
            >
              {copied ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <ol className="space-y-1.5 text-xs text-text-secondary">
            <li className="flex gap-2">
              <span className="font-mono text-text-tertiary">⑦</span>
              <span>构建补丁——写入 DBC、生成 SQL、打包 MPQ</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-text-tertiary">⑧</span>
              <span>审查产物——确认校验报告全绿</span>
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-text-tertiary">⑨</span>
              <span>发布部署——发布 MPQ、部署服务端与客户端</span>
            </li>
          </ol>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-text-secondary">
            将为以下 {resources.length} 只坐骑创建补丁任务：
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
                可以先创建任务，但构建时会失败——建议先补全后再创建。
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

          {mutation.isError && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              创建失败：
              {mutation.error instanceof Error
                ? mutation.error.message
                : "未知错误"}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
