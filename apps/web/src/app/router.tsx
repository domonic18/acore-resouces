import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/app/AppLayout";
import { RequireAuth } from "@/features/auth/AuthContext";
import { RequireAdmin } from "@/app/RequireAdmin";
import { RequirePerm } from "@/app/RequirePerm";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { AccountsPage } from "@/pages/AccountsPage";
import { DistPage } from "@/pages/DistPage";
import { NoAccessPage } from "@/pages/NoAccessPage";
import { ResourceListPage } from "@/pages/ResourceListPage";
import { ResourceDetailPage } from "@/pages/ResourceDetailPage";
import { PreviewPage } from "@/pages/PreviewPage";
import { ResourceFolderPage } from "@/pages/ResourceFolderPage";
import { ExportPage } from "@/pages/ExportPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { DbcPage } from "@/pages/DbcPage";
import { MpqPage } from "@/pages/MpqPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      {
        path: "dist",
        element: (
          <RequirePerm perm="dist">
            <DistPage />
          </RequirePerm>
        ),
      },
      { path: "no-access", element: <NoAccessPage /> },
      {
        path: "accounts",
        element: (
          <RequireAdmin>
            <AccountsPage />
          </RequireAdmin>
        ),
      },
      {
        path: "resources",
        element: (
          <RequirePerm perm="RESOURCE_VIEW">
            <ResourceListPage />
          </RequirePerm>
        ),
      },
      {
        path: "resources/folders",
        element: (
          <RequireAdmin>
            <ResourceFolderPage />
          </RequireAdmin>
        ),
      },
      {
        path: "resources/:resourceType/:id",
        element: (
          <RequirePerm perm="RESOURCE_VIEW">
            <ResourceDetailPage />
          </RequirePerm>
        ),
      },
      {
        path: "preview",
        element: (
          <RequireAdmin>
            <PreviewPage />
          </RequireAdmin>
        ),
      },
      {
        path: "preview/:resourceType/:id",
        element: (
          <RequireAdmin>
            <PreviewPage />
          </RequireAdmin>
        ),
      },
      {
        path: "export",
        element: (
          <RequireAdmin>
            <ExportPage />
          </RequireAdmin>
        ),
      },
      {
        path: "dbc",
        element: (
          <RequireAdmin>
            <DbcPage />
          </RequireAdmin>
        ),
      },
      {
        path: "mpq",
        element: (
          <RequireAdmin>
            <MpqPage />
          </RequireAdmin>
        ),
      },
      {
        path: "settings",
        element: (
          <RequireAdmin>
            <SettingsPage />
          </RequireAdmin>
        ),
      },
      { path: ":resourceType", element: <Navigate to="/resources" replace /> },
      {
        path: ":resourceType/:id",
        element: <Navigate to="/resources" replace />,
      },
    ],
  },
]);
