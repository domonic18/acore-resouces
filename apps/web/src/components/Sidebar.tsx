import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Upload,
  Download,
  Eye,
  Settings,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { LogoIcon } from "@/shared/components/ui/LogoIcon";
import { SHORT_VERSION } from "@/shared/config/version";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const mainNav: NavItem[] = [
  {
    label: "仪表盘",
    path: "/",
    icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
  },
  {
    label: "资源列表",
    path: "/resources",
    icon: <Boxes className="h-[18px] w-[18px]" />,
  },
  {
    label: "导入资源",
    path: "/import",
    icon: <Upload className="h-[18px] w-[18px]" />,
  },
  {
    label: "导出补丁",
    path: "/export",
    icon: <Download className="h-[18px] w-[18px]" />,
  },
  {
    label: "资源预览",
    path: "/preview",
    icon: <Eye className="h-[18px] w-[18px]" />,
  },
];

const systemNav: NavItem[] = [
  {
    label: "设置",
    path: "/settings",
    icon: <Settings className="h-[18px] w-[18px]" />,
  },
];

function isActive(path: string, pathname: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-bg-elevated">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-white">
          <LogoIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-[15px] font-bold tracking-tight truncate">
              ACore 资源库
            </div>
            <span className="text-[10px] font-medium text-text-tertiary">
              {SHORT_VERSION}
            </span>
          </div>
          <div className="text-[10px] text-text-tertiary">
            AzerothCore 资源管理
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          主菜单
        </div>
        {mainNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={cn(
              "mb-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium text-text-secondary transition-all",
              isActive(item.path, pathname)
                ? "bg-accent-soft text-accent"
                : "hover:bg-bg-hover hover:text-text-primary",
            )}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        <div className="mt-4 px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          系统
        </div>
        {systemNav.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={cn(
              "mb-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium text-text-secondary transition-all",
              isActive(item.path, pathname)
                ? "bg-accent-soft text-accent"
                : "hover:bg-bg-hover hover:text-text-primary",
            )}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-bg-surface p-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-xs font-semibold text-white">
            GM
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">Game Master</div>
            <div className="text-[11px] text-text-tertiary">资源管理员</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
