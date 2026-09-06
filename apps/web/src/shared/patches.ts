import { API_BASE, apiFetch, apiGetJson } from "@/shared/api";
import type {
  BuildStatus,
  CleanResult,
  Paginated,
  PatchExportResponse,
  PatchJob,
  PublishResult,
} from "@/shared/types";

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

export function getPatchJobAbsoluteUrl(jobId: string): string {
  return `${API_BASE}/api/patches/${jobId}`;
}

export interface PatchBuildRequest {
  all_requested?: boolean;
  job_ids?: string[];
  dry_run?: boolean;
  force?: boolean;
}

export function buildPatches(
  body: PatchBuildRequest,
): Promise<{ started: boolean }> {
  return apiFetch("/api/patches/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => res.json() as Promise<{ started: boolean }>);
}

export function getBuildStatus(): Promise<BuildStatus> {
  return apiGetJson<BuildStatus>("/api/patches/build/status");
}

export function listPatchJobs(params: {
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<Paginated<PatchJob>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.page_size ?? 20));
  return apiGetJson<Paginated<PatchJob>>(`/api/patches?${query.toString()}`);
}

export function publishPatches(body: {
  start_number?: number;
  dry_run?: boolean;
}): Promise<PublishResult> {
  return apiFetch("/api/patches/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => res.json() as Promise<PublishResult>);
}

export function deletePatchJob(jobId: string): Promise<{
  deleted: boolean;
  job_id: string;
}> {
  return apiFetch(`/api/patches/${jobId}`, { method: "DELETE" }).then(
    (res) => res.json() as Promise<{ deleted: boolean; job_id: string }>,
  );
}

export interface WorkspaceCleanRequest {
  execute?: boolean;
  older_than_days?: number;
  include_published?: boolean;
}

export function cleanWorkspace(body: WorkspaceCleanRequest): Promise<CleanResult> {
  return apiFetch("/api/patches/clean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => res.json() as Promise<CleanResult>);
}
