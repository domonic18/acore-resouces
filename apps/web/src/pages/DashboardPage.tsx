import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Upload,
  Download,
  Eye,
  Search,
  Compass,
  PawPrint,
  Users,
  Bug,
  ArrowRight,
} from "lucide-react";
import { ResourceThumb } from "@/components/ResourceThumb";
import { StatCard } from "@/components/cards/StatCard";
import { DistributionCard } from "@/components/cards/DistributionCard";
import { QuickActionCard } from "@/components/cards/QuickActionCard";
import { ResourceTypeBadge } from "@/components/badges/ResourceTypeBadge";
import { ResourceStatusBadge } from "@/components/badges/ResourceStatusBadge";
import { useResourceStats } from "@/features/resources/hooks/useResourceStats";
import { useRecentResources } from "@/features/resources/hooks/useRecentResources";
import { useResourceListData } from "@/features/resources/hooks/useResourceListData";
import { computeMountStats } from "@/features/resources/lib/dashboard-stats";

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: stats, isLoading: statsLoading } = useResourceStats();
  const recent = useRecentResources();
  const { allItems: mounts, isLoading: mountsLoading } =
    useResourceListData("mount");
  const mountStats = computeMountStats(mounts ?? []);

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (!query) return;
    navigate(`/resources?search=${encodeURIComponent(query)}`);
  };

  const statItems = [
    {
      label: "坐骑资源",
      value: stats.mount,
      to: "/resources?type=mount",
      icon: <Compass className="h-5 w-5" />,
      colorClass: "bg-blue-500/15 text-blue-400",
    },
    {
      label: "宠物资源",
      value: stats.pet,
      to: "/resources?type=pet",
      icon: <PawPrint className="h-5 w-5" />,
      colorClass: "bg-purple-500/15 text-purple-400",
    },
    {
      label: "NPC 资源",
      value: stats.npc,
      to: "/resources?type=npc",
      icon: <Users className="h-5 w-5" />,
      colorClass: "bg-green-500/15 text-green-400",
    },
    {
      label: "待调试资源",
      value: stats.pending,
      to: "/resources?status=pending",
      icon: <Bug className="h-5 w-5" />,
      colorClass: "bg-orange-500/15 text-orange-400",
    },
  ];

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">仪表盘</h1>
        <div className="topbar-actions">
          <div className="search-box">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="搜索资源、ID、模型..."
            />
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 cursor-pointer text-text-tertiary hover:text-text-secondary"
              onClick={handleSearch}
            />
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
            value={statsLoading ? "-" : item.value}
            to={item.to}
            colorClass={item.colorClass}
          />
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary">
            坐骑数据统计
          </h2>
          <Link
            to="/resources?type=mount"
            className="flex items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-secondary"
          >
            查看全部坐骑 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DistributionCard
            title="数据来源"
            subtitle="官方与自定义数据占比"
            rows={mountStats.byOrigin}
            total={mounts?.length ?? 0}
            isLoading={mountsLoading}
          />
          <DistributionCard
            title="坐骑类型"
            subtitle="按 mount_type 分布"
            rows={mountStats.byMountType}
            total={mounts?.length ?? 0}
            isLoading={mountsLoading}
          />
          <DistributionCard
            title="星级分布"
            subtitle="按 star_rating 分布"
            rows={mountStats.byStarRating}
            total={mounts?.length ?? 0}
            isLoading={mountsLoading}
          />
          <DistributionCard
            title="添加状态"
            subtitle="是否已导入游戏库"
            rows={mountStats.byAdded}
            total={mounts?.length ?? 0}
            isLoading={mountsLoading}
          />
          <DistributionCard
            title="调试状态"
            subtitle="debug_passed 校验结果"
            rows={mountStats.byDebug}
            total={mounts?.length ?? 0}
            isLoading={mountsLoading}
          />
          <DistributionCard
            title="数据健康"
            subtitle="导出阻塞项检查"
            rows={mountStats.health}
            total={mounts?.length ?? 0}
            isLoading={mountsLoading}
          />
        </div>
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
