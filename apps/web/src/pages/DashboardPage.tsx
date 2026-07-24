import { Link } from "react-router-dom";
import {
  Upload,
  Download,
  Eye,
  Search,
  Compass,
  PawPrint,
  Users,
  Bug,
} from "lucide-react";
import { ResourceThumb } from "@/components/ResourceThumb";
import { StatCard } from "@/components/cards/StatCard";
import { QuickActionCard } from "@/components/cards/QuickActionCard";
import { ResourceTypeBadge } from "@/components/badges/ResourceTypeBadge";
import { ResourceStatusBadge } from "@/components/badges/ResourceStatusBadge";
import { useResourceStats } from "@/features/resources/hooks/useResourceStats";
import { useRecentResources } from "@/features/resources/hooks/useRecentResources";

export function DashboardPage() {
  const { data: stats, isLoading } = useResourceStats();
  const recent = useRecentResources();

  const statItems = [
    {
      label: "坐骑资源",
      value: stats.mount,
      icon: <Compass className="h-5 w-5" />,
      colorClass: "bg-blue-500/15 text-blue-400",
      change: "+来自合并单元格子行",
    },
    {
      label: "宠物资源",
      value: stats.pet,
      icon: <PawPrint className="h-5 w-5" />,
      colorClass: "bg-purple-500/15 text-purple-400",
      change: "已对齐 Excel",
    },
    {
      label: "NPC 资源",
      value: stats.npc,
      icon: <Users className="h-5 w-5" />,
      colorClass: "bg-green-500/15 text-green-400",
      change: "已对齐 Excel",
    },
    {
      label: "待调试资源",
      value: stats.pending,
      icon: <Bug className="h-5 w-5" />,
      colorClass: "bg-orange-500/15 text-orange-400",
      change: "debug_passed = false",
    },
  ];

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">仪表盘</h1>
        <div className="topbar-actions">
          <div className="search-box">
            <input type="text" placeholder="搜索资源、ID、模型..." />
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          </div>
          <Link to="/import" className="btn btn-primary">
            <Upload className="h-4 w-4" /> 导入
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statItems.map((item) => (
          <StatCard
            key={item.label}
            icon={item.icon}
            label={item.label}
            value={isLoading ? "-" : item.value}
            change={item.change}
            colorClass={item.colorClass}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div>
              <div className="card-title">最近更新</div>
              <div className="card-subtitle">最新变更的资源定义</div>
            </div>
            <Link to="/resources" className="btn btn-sm">
              查看全部
            </Link>
          </div>
          <div className="card-body p-0">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>资源</th>
                  <th>类型</th>
                  <th>星级/稀有度</th>
                  <th>状态</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((resource) => (
                  <tr key={`${resource.resource_type}-${resource.id}`}>
                    <td>
                      <Link
                        to={`/resources/${resource.resource_type}/${resource.id}`}
                        className="name-cell"
                      >
                        <ResourceThumb resource={resource} />
                        <div>
                          <div className="resource-name">
                            {resource.name || resource.model_folder}
                          </div>
                          <div className="resource-meta">
                            id: {String(resource.id).padStart(4, "0")} ·{" "}
                            {resource.model_folder}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <ResourceTypeBadge resource={resource} />
                    </td>
                    <td>{resource.mount_type || resource.rarity || "—"}</td>
                    <td>
                      <ResourceStatusBadge resource={resource} verbose />
                    </td>
                    <td className="text-text-tertiary">
                      {resource.updated_at
                        ? new Date(resource.updated_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-text-secondary"
                    >
                      暂无资源
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">快速操作</div>
              <div className="card-subtitle">常用工作流入口</div>
            </div>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              <QuickActionCard
                to="/import"
                icon={<Upload className="h-5 w-5" />}
                title="导入 Excel"
                desc="从 xlsx 批量导入资源"
                color="blue"
              />
              <QuickActionCard
                to="/export"
                icon={<Download className="h-5 w-5" />}
                title="导出补丁"
                desc="生成 DBC/SQL 补丁"
                color="purple"
              />
              <QuickActionCard
                to="/resources"
                icon={<Eye className="h-5 w-5" />}
                title="资源预览"
                desc="查看模型与贴图"
                color="green"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
