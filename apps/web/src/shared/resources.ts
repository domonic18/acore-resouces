import { apiGetJson } from '@/shared/api';
import type { PaginatedResources, Resource, ResourceAssets, ModelPreview } from '@/shared/types';

export function listResources(
  resourceType: string,
  params: { search?: string; added?: boolean; debug_passed?: boolean; page?: number; page_size?: number },
): Promise<PaginatedResources> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.added !== undefined) query.set('added', String(params.added));
  if (params.debug_passed !== undefined) query.set('debug_passed', String(params.debug_passed));
  if (params.page) query.set('page', String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));
  return apiGetJson(`/api/resources/${resourceType}?${query.toString()}`);
}

export function getResource(resourceType: string, id: number): Promise<Resource> {
  return apiGetJson(`/api/resources/${resourceType}/${id}`);
}

export function getResourceAssets(resourceType: string, id: number): Promise<ResourceAssets> {
  return apiGetJson(`/api/resources/${resourceType}/${id}/assets`);
}

export function getModelPreview(
  modelFolder: string,
  resourceType?: string,
): Promise<ModelPreview> {
  const query = new URLSearchParams();
  if (resourceType) query.set('resource_type', resourceType);
  return apiGetJson(`/api/preview/model/${encodeURIComponent(modelFolder)}?${query.toString()}`);
}

export function getBlpPreviewUrl(path: string, size?: number): string {
  const encoded = encodeURIComponent(path);
  if (size) {
    return `/api/preview/blp/${encoded}?size=${size}`;
  }
  return `/api/preview/blp/${encoded}`;
}

export function getIconPreviewUrl(iconName: string, size?: number): string {
  if (size) {
    return `/api/preview/icon/${encodeURIComponent(iconName)}?size=${size}`;
  }
  return `/api/preview/icon/${encodeURIComponent(iconName)}`;
}
