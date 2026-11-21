import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { CreatePatchJobsDialog } from "@/features/resources/components/patch-export/CreatePatchJobsDialog";
import type { Resource } from "@/shared/types";

interface PatchExportButtonProps {
  resource: Resource;
  variant?: "default" | "sm";
}

/**
 * 为单只坐骑创建补丁任务（生产流程第 6 步）。
 *
 * 与列表页的批量入口共用同一个对话框，交互保持一致。
 */
export function PatchExportButton({
  resource,
  variant = "default",
}: PatchExportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "sm"
            ? "btn btn-sm btn-primary whitespace-nowrap"
            : "btn btn-primary whitespace-nowrap"
        }
        title={`为 ${resource.name || resource.model_folder} 创建补丁任务（生产流程第 6 步）`}
      >
        <PackagePlus className="h-4 w-4" />
        创建补丁任务
      </button>

      <CreatePatchJobsDialog
        open={open}
        onClose={() => setOpen(false)}
        resources={[resource]}
      />
    </>
  );
}
