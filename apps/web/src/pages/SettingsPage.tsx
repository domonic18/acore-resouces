import { useQuery } from "@tanstack/react-query";
import { Compass, Database, FolderCog, PawPrint, Users } from "lucide-react";
import { getSystemInfo } from "@/shared/system";

const PATH_LABELS: { key: string; label: string }[] = [
  { key: "project_root", label: "项目根目录" },
  { key: "data_dir", label: "数据目录" },
  { key: "resources_dir", label: "资源定义（YAML 真相源）" },
  { key: "sources_dir", label: "原始资源（M2/BLP）" },
  { key: "workspace_dir", label: "工作区" },
  { key: "patch_jobs_dir", label: "补丁任务" },
  { key: "acore_sql_updates_dir", label: "SQL 补丁输出（AzerothCore）" },
  { key: "logs_dir", label: "日志" },
  { key: "db_file", label: "SQLite 运行时缓存" },
];

export function SettingsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["system-info"],
    queryFn: getSystemInfo,
  });

  const overview = [
    {
      label: "坐骑资源",
      value: data?.counts.mounts,
      icon: <Compass className="h-5 w-5" />,
      colorClass: "bg-blue-500/15 text-blue-400",
    },
    {
      label: "宠物资源",
      value: data?.counts.pets,
      icon: <PawPrint className="h-5 w-5" />,
      colorClass: "bg-purple-500/15 text-purple-400",
    },
    {
      label: "NPC 资源",
      value: data?.counts.npcs,
      icon: <Users className="h-5 w-5" />,
      colorClass: "bg-green-500/15 text-green-400",
    },
  ];

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">设置</h1>
        <div className="topbar-actions">
          <span className="text-xs text-text-tertiary">只读系统信息</span>
        </div>
      </header>

      {isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          系统信息加载失败，请确认后端服务正在运行
        </div>
      )}

      {isLoading && (
        <div className="py-12 text-center text-sm text-text-tertiary">
          加载中...
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {overview.map((item) => (
              <div
                key={item.label}
                className="card border-border bg-bg-elevated p-5"
              >
                <div
                  className={`mb-3.5 flex h-10 w-10 items-center justify-center rounded-md text-lg ${item.colorClass}`}
                >
                  {item.icon}
                </div>
                <div className="text-[28px] font-extrabold tracking-tight">
                  {item.value ?? 0}
                </div>
                <div className="text-xs font-medium text-text-secondary">
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <div className="card-header">
                <div>
                  <div className="card-title flex items-center gap-2">
                    <FolderCog className="h-4 w-4" /> 路径配置
                  </div>
                  <div className="card-subtitle">
                    来自后端环境配置（.env / 默认值），如需修改请编辑后端配置
                  </div>
                </div>
              </div>
              <div className="card-body p-0">
                <table className="data-table w-full">
                  <tbody>
                    {PATH_LABELS.map(({ key, label }) => (
                      <tr key={key}>
                        <td className="w-64 text-text-secondary">{label}</td>
                        <td className="break-all font-mono text-xs">
                          {data.paths[key as keyof typeof data.paths] ?? "未配置"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title flex items-center gap-2">
                    <Database className="h-4 w-4" /> 健康状态
                  </div>
                  <div className="card-subtitle">关键文件存在性检查</div>
                </div>
              </div>
              <div className="card-body space-y-3">
                {[
                  { label: "registry.json 索引", ok: data.health.registry_exists },
                  { label: "SQLite 数据库", ok: data.health.db_exists },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm"
                  >
                    <span>{item.label}</span>
                    <span
                      className={`badge ${item.ok ? "badge-success" : "badge-danger"}`}
                    >
                      {item.ok ? "正常" : "缺失"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
