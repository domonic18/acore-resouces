import { useState } from "react";
import { Hammer, Loader2 } from "lucide-react";
import { useBuildStatus, usePatchBuild } from "@/features/resources/hooks/usePatchBuild";

export function BuildPanel() {
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const buildStatus = useBuildStatus();
  const buildMutation = usePatchBuild();

  const building = buildStatus.data?.running ?? false;
  const result = buildStatus.data?.result;
  const buildError = buildStatus.data?.error;

  const handleBuild = () => {
    buildMutation.mutate({ all_requested: true, dry_run: dryRun, force });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="h-4 w-4 accent-blue-500"
          />
          干跑模式（仅校验冲突并生成计划，不修改源文件）
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            className="h-4 w-4 accent-red-500"
          />
          <span className="text-danger">强制重写已存在的 DBC 记录（全量重建）</span>
        </label>
      </div>

      <button
        type="button"
        onClick={handleBuild}
        disabled={building || buildMutation.isPending}
        className="btn btn-primary w-full"
      >
        {building ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> 构建中...（每 2 秒自动刷新）
          </>
        ) : (
          <>
            <Hammer className="h-4 w-4" />
            {dryRun ? "干跑校验全部待处理任务" : "构建全部待处理任务"}
          </>
        )}
      </button>

      {buildMutation.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {buildMutation.error instanceof Error
            ? buildMutation.error.message
            : "构建启动失败"}
        </div>
      )}

      {buildError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {buildError}
        </div>
      )}

      {result && !buildError && (
        <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <div className="font-semibold">
            {result.dry_run ? "干跑完成" : "构建完成"} · 处理 {result.jobs.length}{" "}
            个任务
          </div>
          <ul className="mt-1 space-y-0.5 text-text-secondary">
            <li>新增 SQL：{result.sql_files.length} 个文件</li>
            {result.mpq_path && <li className="break-all">MPQ：{result.mpq_path}</li>}
            {result.report_path && (
              <li className="break-all">校验报告：{result.report_path}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
