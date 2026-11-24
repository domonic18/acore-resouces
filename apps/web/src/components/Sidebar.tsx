import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Download,
  FolderTree,
  Database,
  Package,
  Settings,
  Users,
  KeyRound,
  LogOut,
  HardDriveDownload,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { LogoIcon } from "@/shared/components/ui/LogoIcon";
import { SHORT_VERSION } from "@/shared/config/version";
import { useAuth, resourcePermsOf } from "@/features/auth/useAuth";
import { ChangePasswordDialog } from "@/features/auth/ChangePasswordDialog";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  mount: "坐骑",
  pet: "宠物",
  npc: "NPC",
};

function buildViewerNavGroups(
  hasPerm: (code: string) => boolean,
  perms: string[],
): NavGroup[] {
  const groups: NavGroup[] = [];
  if (perms.length > 0) {
    groups.push({
      label: "资源浏览",
      items: [
        {
          label:
            perms.length === 1
              ? `${RESOURCE_TYPE_LABEL[perms[0]] ?? ""}资源`
              : "全部资源",
          path: "/resources",
          icon: <Boxes className="h-[18px] w-[18px]" />,
        },
      ],
    });
  }
  if (hasPerm("dist")) {
    groups.push({
      label: "补丁下载",
      items: [
        {
          label: "补丁下载",
          path: "/dist",
          icon: <HardDriveDownload className="h-[18px] w-[18px]" />,
        },
      ],
    });
  }
  return groups;
}

const adminNavGroups: NavGroup[] = [
  {
    label: "概览",
    items: [
      {
        label: "仪表盘",
        path: "/",
        icon: <LayoutDashboard className="h-[18px] w-[18px]" />,
      },
    ],
  },
  {
    label: "资源制作",
    items: [
      {
        label: "资源管理",
        path: "/resources",
        icon: <Boxes className="h-[18px] w-[18px]" />,
      },
      {
        label: "资源目录",
        path: "/resources/folders",
        icon: <FolderTree className="h-[18px] w-[18px]" />,
      },
      {
        label: "DBC 数据",
        path: "/dbc",
        icon: <Database className="h-[18px] w-[18px]" />,
      },
    ],
  },
  {
    label: "补丁工坊",
    items: [
      {
        label: "导出补丁",
        path: "/export",
        icon: <Download className="h-[18px] w-[18px]" />,
      },
      {
        label: "MPQ 查看",
        path: "/mpq",
        icon: <Package className="h-[18px] w-[18px]" />,
      },
    ],
  },
  {
    label: "发布分发",
    items: [
      {
        label: "补丁下载",
        path: "/dist",
        icon: <HardDriveDownload className="h-[18px] w-[18px]" />,
      },
    ],
  },
  {
    label: "系统",
    items: [
      {
        label: "设置",
        path: "/settings",
        icon: <Settings className="h-[18px] w-[18px]" />,
      },
      {
        label: "账号权限",
        path: "/accounts",
        icon: <Users className="h-[18px] w-[18px]" />,
      },
    ],
  },
];

function isActive(path: string, pathname: string): boolean {
  if (path === "/") return pathname === "/";
  if (pathname === path) return true;
  if (path === "/resources") {
    return (
      pathname.startsWith("/resources/") &&
      !pathname.startsWith("/resources/folders")
    );
  }
  return pathname.startsWith(`${path}/`);
}

export function Sidebar() {
  const { pathname } = useLocation();
  const { user, isAdmin, hasPerm, signOut } = useAuth();
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);

  function handleSignOut() {
    signOut();
    navigate("/login", { replace: true });
  }

  const roleLabel = isAdmin ? "管理员" : "普通账号";
  const initial = (user?.username ?? "?").slice(0, 1).toUpperCase();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-bg-elevated">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center">
          <LogoIcon className="h-9 w-9" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-[15px] font-bold tracking-tight truncate">
              探险者宝库
            </div>
            <span className="text-[10px] font-medium text-text-tertiary">
              {SHORT_VERSION}
            </span>
          </div>
          <div className="text-[10px] text-text-tertiary">
            资源典藏与补丁工坊
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {(isAdmin ? adminNavGroups : buildViewerNavGroups(hasPerm, resourcePermsOf(user))).map(
          (group, groupIndex) => (
            <div key={group.label} className={groupIndex > 0 ? "mt-4" : ""}>
              <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                {group.label}
              </div>
              {group.items.map((item) => (
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
            </div>
          ),
        )}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-bg-surface p-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-xs font-semibold text-white">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">{user?.username ?? "未登录"}</div>
            <div className="text-[11px] text-text-tertiary">{roleLabel}</div>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
            title="修改密码"
            onClick={() => setPasswordOpen(true)}
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
            title="退出登录"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </aside>
  );
}
