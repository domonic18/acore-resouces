import { API_BASE, apiFetch } from "@/shared/api";
import type { PatchExportResponse } from "@/shared/types";

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
