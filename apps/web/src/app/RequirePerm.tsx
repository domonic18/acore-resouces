import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth, viewerHome } from "@/features/auth/useAuth";

/**
 * 查看权限守卫：viewer 必须拥有 perm（或 RESOURCE_VIEW 任一）才可进入，
 * 否则跳到其权限允许的首个页面；admin 恒通。
 */
export function RequirePerm({
  perm,
  children,
}: {
  /** 需要的权限码；传 "RESOURCE_VIEW" 表示 mount/pet/npc 任一即可 */
  perm: string;
  children: ReactNode;
}) {
  const { user, isAdmin, hasPerm } = useAuth();
  const allowed =
    isAdmin ||
    (perm === "RESOURCE_VIEW"
      ? ["mount", "pet", "npc"].some((code) => hasPerm(code))
      : hasPerm(perm));
  if (!allowed) return <Navigate to={viewerHome(user)} replace />;
  return <>{children}</>;
}
