import { PackagePlus } from "lucide-react";
import { CreatePatchJobsDialog } from "@/features/resources/components/patch-export/CreatePatchJobsDialog";
import { useCanWrite } from "@/features/auth/useAuth";
import { useState } from "react";
import type { Resource } from "@/shared/types";

interface BulkPatchExportButtonProps {
  resources: Resource[];
  disabled?: boolean;
}

/**
 * 批量进入补丁制作流程（跳转向导第⑥步，任务创建统一在向导里）。
 *
 * 点击后打开对话框——在对话框里确认坐骑、查看预检结果，然后带着勾选
 * 跳到「导出补丁」页的向导选择步骤。
 */
export function BulkPatchExportButton({
  resources,
  disabled: disabledProp,
}: BulkPatchExportButtonProps) {
  const [open, setOpen] = useState(false);
  const canWrite = useCanWrite();
  const disabled = !canWrite || resources.length === 0 || disabledProp;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="btn btn-primary whitespace-nowrap"
        title={canWrite ? "带着选中的坐骑进入补丁向导" : "仅管理员可制作补丁"}
      >
        <PackagePlus className="h-4 w-4" />
        制作补丁
        {resources.length > 0 && (
          <span className="ml-1 rounded-full bg-white/15 px-1.5 text-xs tabular-nums">
            {resources.length}
          </span>
        )}
      </button>

      <CreatePatchJobsDialog
        open={open}
        onClose={() => setOpen(false)}
        resources={resources}
      />
    </>
  );
}
