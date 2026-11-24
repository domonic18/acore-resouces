import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { CreatePatchJobsDialog } from "@/features/resources/components/patch-export/CreatePatchJobsDialog";
import { useCanWrite } from "@/features/auth/useAuth";
import type { Resource } from "@/shared/types";

interface PatchExportButtonProps {
  resource: Resource;
  variant?: "default" | "sm";
}

/**
 * 为单只坐骑进入补丁制作流程（跳转向导第⑥步，任务创建统一在向导里）。
 *
 * 与列表页的批量入口共用同一个对话框，交互保持一致。
 */
export function PatchExportButton({
  resource,
  variant = "default",
}: PatchExportButtonProps) {
  const [open, setOpen] = useState(false);
  const canWrite = useCanWrite();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canWrite}
        className={
          variant === "sm"
            ? "btn btn-sm btn-primary whitespace-nowrap"
            : "btn btn-primary whitespace-nowrap"
        }
        title={
          canWrite
            ? `带着 ${resource.name || resource.model_folder} 进入补丁向导`
            : "仅管理员可制作补丁"
        }
      >
        <PackagePlus className="h-4 w-4" />
        制作补丁
      </button>

      <CreatePatchJobsDialog
        open={open}
        onClose={() => setOpen(false)}
        resources={[resource]}
      />
    </>
  );
}
