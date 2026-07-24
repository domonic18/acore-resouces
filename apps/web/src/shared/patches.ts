import { API_BASE, apiFetch, apiGetJson } from "@/shared/api";
import type { Paginated, PatchExportResponse, PatchJob } from "@/shared/types";

export interface PatchExportRequest {
  resource_type: string;
  resource_ids: number[];
}

export function requestPatchExport(
  resourceType: string,
  resourceIds: number[],
): Promise<PatchExportResponse> {
  const body: PatchExportRequest = {
    resource_type: resourceType,
    resource_ids: resourceIds,
  };
  return apiFetch("/api/patches/export-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => res.json() as Promise<PatchExportResponse>);
}

export function listPatchJobs(params?: {
  resource_type?: string;
  resource_id?: number;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<Paginated<PatchJob>> {
  const query = new URLSearchParams();
  if (params?.resource_type) query.set("resource_type", params.resource_type);
  if (params?.resource_id !== undefined)
    query.set("resource_id", String(params.resource_id));
  if (params?.status) query.set("status", params.status);
  if (params?.page) query.set("page", String(params.page));
  if (params?.page_size) query.set("page_size", String(params.page_size));
  return apiGetJson<Paginated<PatchJob>>(`/api/patches?${query.toString()}`);
}

export function getPatchJob(jobId: string): Promise<PatchJob> {
  return apiGetJson<PatchJob>(`/api/patches/${jobId}`);
}

export function updatePatchJob(
  jobId: string,
  update: {
    status?: "requested" | "generated" | "applied" | "failed";
    artifacts?: Record<string, string>;
    summary?: string;
  },
): Promise<PatchJob> {
  return apiFetch(`/api/patches/${jobId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  }).then((res) => res.json() as Promise<PatchJob>);
}

export function getPatchJobAbsoluteUrl(jobId: string): string {
  return `${API_BASE}/api/patches/${jobId}`;
}

export function getPatchJobDirUrl(jobId: string): string {
  // 前后端约定 patch job 目录位于 workspace/patch-jobs/{job_id}
  return `${API_BASE}/api/files?path=workspace/patch-jobs/${encodeURIComponent(jobId)}`;
}
