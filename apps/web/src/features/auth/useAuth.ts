import { useContext } from "react";
import type { AuthUser } from "@/shared/auth";
import { AuthContext } from "@/features/auth/context";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}

/** 是否可执行写操作：仅管理员。用于禁用各处写按钮。 */
export function useCanWrite(): boolean {
  return useAuth().isAdmin;
}

const RESOURCE_PERMS = ["mount", "pet", "npc"] as const;

/** 拥有的资源查看权限码（admin 全量；用于资源页签过滤） */
export function resourcePermsOf(user: AuthUser | null): string[] {
  if (!user) return [];
  if (user.role === "admin") return [...RESOURCE_PERMS];
  return RESOURCE_PERMS.filter((code) => (user.permissions ?? []).includes(code));
}

/** viewer 的落脚页：按权限选首个可访问页面；无任何权限 → /no-access */
export function viewerHome(user: AuthUser | null): string {
  if (!user) return "/login";
  const perms = user.permissions ?? [];
  if (perms.includes("dist")) return "/dist";
  if (RESOURCE_PERMS.some((code) => perms.includes(code))) return "/resources";
  return "/no-access";
}
