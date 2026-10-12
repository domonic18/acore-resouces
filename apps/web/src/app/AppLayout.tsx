import { Outlet } from "react-router-dom";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Sidebar } from "@/components/Sidebar";

export function AppLayout() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="ml-60 flex flex-1 flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
