import { CheckCircle2, RotateCcw } from "lucide-react";
import { formatDuration } from "./shared";
import type { WizardCompletedViewProps } from "./types";

/** 向导完成页：发布成功后的总结与上线待办。 */
export function WizardCompletedView({
  status,
  buildResult,
  buildError,
  publishResult,
  onReset,
  onGoToResources,
}: WizardCompletedViewProps) {
  const buildSucceeded = buildResult !== null && buildError === null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-success">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-semibold text-text-primary">
          补丁包制作流程已完成
        </span>
      </div>
      {buildSucceeded && (
        <ul className="space-y-0.5 text-sm text-text-secondary">
          <li>
            构建：处理 {buildResult.jobs.length} 个任务
            {buildResult.dry_run ? "（干跑）" : ""}，新增 SQL{" "}
            {buildResult.sql_files.length} 个文件，耗时{" "}
            {formatDuration(status?.started_at ?? null, status?.finished_at ?? null)}
          </li>
          {buildResult.mpq_path && (
            <li className="break-all font-mono text-xs">
              MPQ：{buildResult.mpq_path}
            </li>
          )}
          {publishResult && (
            <li>
              发布：
              {publishResult.published.length > 0
                ? `已发布 ${publishResult.published.length} 个批次，下一个编号 ${publishResult.next_number}`
                : "无可发布批次"}
            </li>
          )}
        </ul>
      )}
      <div className="rounded-md border border-border bg-bg-surface px-3 py-3 text-xs text-text-secondary">
        <div className="mb-2 font-semibold text-text-primary">
          还剩 4 步就真正上线（第 9 步）
        </div>
        <ol className="space-y-2">
          <li className="flex gap-2">
            <span className="font-mono text-text-tertiary">1.</span>
            <span>
              <span className="text-text-primary">导入服务端 SQL</span>
              <br />
              <code className="font-mono text-text-primary">
                data/sql/azerothcore-updates/mounts/
              </code>{" "}
              下的补丁需导入{" "}
              <code className="font-mono text-text-primary">
                acore_world
              </code>
              。该目录不在 AzerothCore 的更新追踪表里，
              <b>worldserver 重启才会自动加载</b>
              ，否则需手工导入
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-text-tertiary">2.</span>
            <span>
              <span className="text-text-primary">同步 DBC 到测试服</span>
              <br />
              <code className="font-mono text-text-primary">
                bash acore-deploy/scripts/acore-update-dbc.sh --local-path
                data/wow-dbc/src/dbc
              </code>
              ，并提交 data/wow-dbc 子模块的改动
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-text-tertiary">3.</span>
            <span>
              <span className="text-text-primary">部署客户端</span>
              <br />
              把上面列出的 MPQ 复制到客户端{" "}
              <code className="font-mono text-text-primary">
                World of Warcraft/Data/
              </code>
              ，删除 <code className="font-mono">Data/cache/</code>{" "}
              后重启客户端。补丁编号必须大于客户端已有的最大编号
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-text-tertiary">4.</span>
            <span>
              <span className="text-text-primary">实测并标记上线</span>
              <br />
              在资源详情页确认模型、召唤与特性都正常，勾选「调试通过」与
              「已添加」后保存——这两个标记是流程第 9 步的完成判据
            </span>
          </li>
        </ol>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className="btn" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" /> 再制作一批
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onGoToResources}
        >
          去资源管理勾选「调试通过」
        </button>
      </div>
    </div>
  );
}
