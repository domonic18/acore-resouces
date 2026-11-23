import { Outlet } from "react-router-dom";
import { Eye } from "lucide-react";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/features/auth/useAuth";

export function AppLayout() {
  const { isAdmin } = useAuth();
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="ml-60 flex flex-1 flex-col">
          {!isAdmin && (
            <div className="viewer-banner">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              查看模式：当前账号仅有查看权限，编辑功能仅限管理员
            </div>
          )}
          <div className="flex-1">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
