import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Upload, Download, Eye, Search } from "lucide-react";
import { listResources } from "@/shared/resources";
import { ResourceThumb } from "@/components/ResourceThumb";
import type { Resource } from "@/shared/types";

function useResourceStats() {
  const results = useQueries({
    queries: [
      {
        queryKey: ["stats", "mount"],
        queryFn: () => listResources("mount", { page_size: 1 }),
      },
      {
        queryKey: ["stats", "pet"],
        queryFn: () => listResources("pet", { page_size: 1 }),
      },
      {
        queryKey: ["stats", "npc"],
        queryFn: () => listResources("npc", { page_size: 1 }),
      },
    ],
  });

  const [mountRes, petRes, npcRes] = results;
  return {
    isLoading: results.some((r) => r.isLoading),
    data: {
      mount: mountRes.data?.total ?? 0,
      pet: petRes.data?.total ?? 0,
      npc: npcRes.data?.total ?? 0,
      pending:
        (mountRes.data?.items.filter((r) => !r.debug_passed).length ?? 0) +
        (petRes.data?.items.filter((r) => !r.debug_passed).length ?? 0) +
        (npcRes.data?.items.filter((r) => !r.debug_passed).length ?? 0),
    },
  };
}

function useRecentResources() {
  const results = useQueries({
    queries: [
      {
        queryKey: ["recent", "mount"],
        queryFn: () => listResources("mount", { page_size: 5 }),
      },
      {
        queryKey: ["recent", "pet"],
        queryFn: () => listResources("pet", { page_size: 5 }),
      },
      {
        queryKey: ["recent", "npc"],
        queryFn: () => listResources("npc", { page_size: 5 }),
      },
    ],
  });

  return useMemo(() => {
    const all: Resource[] = [];
    for (const res of results) {
      if (res.data) all.push(...res.data.items);
    }
    return all.sort((a, b) => b.id - a.id).slice(0, 5);
  }, [results]);
}

export function DashboardPage() {
  const { data: stats, isLoading } = useResourceStats();
  const recent = useRecentResources();

  const statItems = [
    {
      label: "坐骑资源",
      value: stats.mount,
      icon: "🐎",
      color: "bg-blue-500/15 text-blue-400",
      change: "+来自合并单元格子行",
    },
    {
      label: "宠物资源",
      value: stats.pet,
      icon: "🐾",
      color: "bg-purple-500/15 text-purple-400",
      change: "已对齐 Excel",
    },
    {
      label: "NPC 资源",
      value: stats.npc,
      icon: "🧙",
      color: "bg-green-500/15 text-green-400",
      change: "已对齐 Excel",
    },
    {
      label: "待调试资源",
      value: stats.pending,
      icon: "⚡",
      color: "bg-orange-500/15 text-orange-400",
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
          <div
            key={item.label}
            className="card border-border bg-bg-elevated p-5 transition-all hover:-translate-y-0.5 hover:border-border-hover"
          >
            <div
              className={cn(
                "mb-3.5 flex h-10 w-10 items-center justify-center rounded-md text-lg",
                item.color,
              )}
            >
              {item.icon}
            </div>
            <div className="text-[28px] font-extrabold tracking-tight">
              {isLoading ? "-" : item.value}
            </div>
            <div className="text-xs font-medium text-text-secondary">
              {item.label}
            </div>
            <div className="mt-2 text-[11px] font-medium text-success">
              {item.change}
            </div>
          </div>
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
                      <TypeBadge resource={resource} />
                    </td>
                    <td>{resource.mount_type || resource.rarity || "—"}</td>
                    <td>
                      <StatusBadge resource={resource} />
                    </td>
                    <td className="text-text-tertiary">—</td>
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

function QuickActionCard({
  to,
  icon,
  title,
  desc,
  color,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: "blue" | "purple" | "green";
}) {
  const colorClass = {
    blue: "bg-blue-500/15 text-blue-400",
    purple: "bg-purple-500/15 text-purple-400",
    green: "bg-green-500/15 text-green-400",
  }[color];

  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-lg border border-border bg-bg-surface p-4 transition-all hover:border-border-hover hover:bg-bg-hover"
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg",
          colorClass,
        )}
      >
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary">{desc}</div>
      </div>
    </Link>
  );
}

function TypeBadge({ resource }: { resource: Resource }) {
  const config: Record<string, { label: string; className: string }> = {
    mount: { label: resource.mount_type || "坐骑", className: "badge-blue" },
    pet: { label: "宠物", className: "badge-orange" },
    npc: { label: "NPC", className: "badge-green" },
  };
  const { label, className } = config[resource.resource_type] || {
    label: resource.resource_type,
    className: "badge-gray",
  };
  return <span className={cn("badge", className)}>{label}</span>;
}

function StatusBadge({ resource }: { resource: Resource }) {
  if (resource.debug_passed && resource.added) {
    return (
      <span className="text-sm text-text-secondary">
        <span className="status-dot bg-success" />
        已通过 · 已添加
      </span>
    );
  }
  if (resource.debug_passed) {
    return (
      <span className="text-sm text-text-secondary">
        <span className="status-dot bg-success" />
        已通过
      </span>
    );
  }
  return (
    <span className="text-sm text-text-secondary">
      <span className="status-dot bg-warning" />
      待调试 · 未添加
    </span>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
