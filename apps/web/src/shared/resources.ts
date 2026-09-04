import { API_BASE, apiFetch, apiGetJson } from "@/shared/api";
import type {
  ItemDisplayInfoEntry,
  ItemDisplayInfoPage,
  PaginatedResources,
  Resource,
  ResourceAssets,
  ResourceUpdate,
  ModelPreview,
} from "@/shared/types";

function buildPreviewUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function listResources(
  resourceType: string,
  params: {
    search?: string;
    added?: boolean;
    debug_passed?: boolean;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_order?: "asc" | "desc";
  },
): Promise<PaginatedResources> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.added !== undefined) query.set("added", String(params.added));
  if (params.debug_passed !== undefined)
    query.set("debug_passed", String(params.debug_passed));
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));
  if (params.sort_by) query.set("sort_by", params.sort_by);
  if (params.sort_order) query.set("sort_order", params.sort_order);
  return apiGetJson(`/api/resources/${resourceType}?${query.toString()}`);
}

export function getResource(
  resourceType: string,
  id: number,
): Promise<Resource> {
  return apiGetJson(`/api/resources/${resourceType}/${id}`);
}

export function getResourceAssets(
  resourceType: string,
  id: number,
): Promise<ResourceAssets> {
  return apiGetJson(`/api/resources/${resourceType}/${id}/assets`);
}

export function getModelPreview(
  modelFolder: string,
  resourceType?: string,
): Promise<ModelPreview> {
  const query = new URLSearchParams();
  if (resourceType) query.set("resource_type", resourceType);
  return apiGetJson(
    `/api/preview/model/${encodeURIComponent(modelFolder)}?${query.toString()}`,
  );
}

export function getBlpPreviewUrl(path: string, size?: number): string {
  const encoded = encodeURIComponent(path);
  if (size) {
    return buildPreviewUrl(`/api/preview/blp/${encoded}?size=${size}`);
  }
  return buildPreviewUrl(`/api/preview/blp/${encoded}`);
}

export function getIconPreviewUrl(iconName: string, size?: number): string {
  if (size) {
    return buildPreviewUrl(
      `/api/preview/icon/${encodeURIComponent(iconName)}?size=${size}`,
    );
  }
  return buildPreviewUrl(`/api/preview/icon/${encodeURIComponent(iconName)}`);
}

export function getIconWowheadUrl(iconName: string): string {
  return `https://wow.zamimg.com/images/wow/icons/medium/${encodeURIComponent(iconName)}.jpg`;
}

export function getFilePreviewUrl(path: string): string {
  return buildPreviewUrl(`/api/preview/file/${encodeURIComponent(path)}`);
}

export function getM2FileUrl(relativePath: string): string {
  return getFilePreviewUrl(relativePath);
}

export async function fetchM2Binary(
  relativePath: string,
): Promise<ArrayBuffer> {
  const response = await apiFetch(getM2FileUrl(relativePath));
  return response.arrayBuffer();
}

export async function fetchAnimBinary(
  relativePath: string,
): Promise<ArrayBuffer> {
  const response = await apiFetch(getM2FileUrl(relativePath));
  return response.arrayBuffer();
}

export function getResourceCount(resourceType: string): Promise<number> {
  return listResources(resourceType, { page_size: 1 }).then((res) => res.total);
}

export async function fetchAllResources(
  resourceType: "all" | "mount" | "pet" | "npc",
  opts?: { added?: boolean },
): Promise<Resource[]> {
  const types =
    resourceType === "all" ? ["mount", "pet", "npc"] : [resourceType];
  const all: Resource[] = [];
  await Promise.all(
    types.map(async (type) => {
      const items: Resource[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await listResources(type, {
          page,
          page_size: 100,
          added: opts?.added,
        });
        items.push(...res.items);
        if (res.items.length < res.page_size || page >= 100) {
          hasMore = false;
        } else {
          page += 1;
        }
      }
      all.push(...items);
    }),
  );
  return all.sort((a, b) => b.id - a.id);
}

export async function getAllIcons(): Promise<string[]> {
  return apiGetJson("/api/preview/icons");
}

export async function searchItemDisplayInfo(params: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ItemDisplayInfoPage> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  return apiGetJson(`/api/dbc/item-display-info?${query.toString()}`);
}

export async function getItemDisplayInfo(
  id: number,
): Promise<ItemDisplayInfoEntry> {
  return apiGetJson(`/api/dbc/item-display-info/${id}`);
}

export async function updateResourceIcon(
  resourceType: string,
  id: number,
  iconName: string,
): Promise<Resource> {
  return apiFetch(`/api/resources/${resourceType}/${id}/icon`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ icon_name: iconName }),
  }).then((res) => res.json() as Promise<Resource>);
}

export async function updateResource(
  resourceType: string,
  id: number,
  update: ResourceUpdate,
): Promise<Resource> {
  return apiFetch(`/api/resources/${resourceType}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  }).then((res) => res.json() as Promise<Resource>);
}
