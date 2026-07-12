import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/app/AppLayout';
import { ResourceListPage } from '@/pages/ResourceListPage';
import { ResourceDetailPage } from '@/pages/ResourceDetailPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/mounts" replace /> },
      { path: ':resourceType', element: <ResourceListPage /> },
      { path: ':resourceType/:id', element: <ResourceDetailPage /> },
    ],
  },
]);
