import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth, viewerHome } from "@/features/auth/useAuth";

/** 管理员守卫：非 admin 跳到其权限允许的首个页面。 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to={viewerHome(user)} replace />;
  return <>{children}</>;
}
