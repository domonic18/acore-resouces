import { Navigate } from "react-router-dom";
import { useAuth, viewerHome } from "@/features/auth/useAuth";
import { DashboardPage } from "@/pages/DashboardPage";

/** 首页：admin 进仪表盘，viewer 按权限跳首个可访问页面。 */
export function HomePage() {
  const { user, isAdmin } = useAuth();
  if (isAdmin) return <DashboardPage />;
  return <Navigate to={viewerHome(user)} replace />;
}
