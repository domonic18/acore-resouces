import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-60 flex flex-1 flex-col">
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
