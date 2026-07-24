import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/app/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { ResourceListPage } from "@/pages/ResourceListPage";
import { ResourceDetailPage } from "@/pages/ResourceDetailPage";
import { PreviewPage } from "@/pages/PreviewPage";
import { ResourceFolderPage } from "@/pages/ResourceFolderPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "resources", element: <ResourceListPage /> },
      { path: "resources/folders", element: <ResourceFolderPage /> },
      { path: "resources/:resourceType/:id", element: <ResourceDetailPage /> },
      { path: "preview", element: <PreviewPage /> },
      { path: "preview/:resourceType/:id", element: <PreviewPage /> },
      { path: "import", element: <PlaceholderPage title="导入资源" /> },
      { path: "export", element: <PlaceholderPage title="导出补丁" /> },
      { path: "settings", element: <PlaceholderPage title="设置" /> },
      { path: ":resourceType", element: <Navigate to="/resources" replace /> },
      {
        path: ":resourceType/:id",
        element: <Navigate to="/resources" replace />,
      },
    ],
  },
]);
