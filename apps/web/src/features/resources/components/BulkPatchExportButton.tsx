import { PackagePlus } from "lucide-react";
import { CreatePatchJobsDialog } from "@/features/resources/components/patch-export/CreatePatchJobsDialog";
import { useState } from "react";
import type { Resource } from "@/shared/types";

interface BulkPatchExportButtonProps {
  resources: Resource[];
  disabled?: boolean;
}

/**
 * 批量创建补丁任务（生产流程第 6 步）。
 *
 * 点击后打开对话框——在对话框里确认坐骑、查看预检结果、创建任务，
 * 而不是直接弹一个任务 ID 列表了事。
 */
export function BulkPatchExportButton({
  resources,
  disabled: disabledProp,
}: BulkPatchExportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={resources.length === 0 || disabledProp}
        className="btn btn-primary whitespace-nowrap"
        title="为选中的坐骑创建补丁任务（生产流程第 6 步）"
      >
        <PackagePlus className="h-4 w-4" />
        创建补丁任务
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
