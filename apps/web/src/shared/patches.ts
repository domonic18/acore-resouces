import { API_BASE, apiFetch, apiGetJson } from "@/shared/api";
import type {
  BatchCompareResult,
  BuildStatus,
  CleanResult,
  JobArtifactsOut,
  JobPlansOut,
  MountPatchPreview,
  Paginated,
  PatchBatch,
  PatchExportResponse,
  PatchJob,
  PatchJobAudit,
  PublishResult,
  ResourceFlowState,
  ResourceRelationshipReport,
  ValidationReportOut,
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
  /** 混淆等级：basic 在打包后剥除档案内 (listfile)/(attributes) */
  obfuscation?: "none" | "basic";
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

export function listPatchBatches(params: {
  status?: string;
}): Promise<{ total: number; items: PatchBatch[] }> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiGetJson<{ total: number; items: PatchBatch[] }>(
    `/api/patches/batches${suffix}`,
  );
}

/** 任选两批次产物对比（基于审计报告；同批 400，缺审计报告 404） */
export function compareBatches(
  batchId: string,
  againstBatchId: string,
): Promise<BatchCompareResult> {
  return apiGetJson<BatchCompareResult>(
    `/api/patches/batches/${encodeURIComponent(batchId)}/compare?against=${encodeURIComponent(againstBatchId)}`,
  );
}

/**
 * 归一化发布响应。
 *
 * 前后端版本可能错配（前端 dist 是 bind mount、后端进程需重启才生效），
 * 旧版后端不返回 preview 字段。缺字段补空数组，避免界面读到 undefined.length 崩掉。
 */
function normalizePublishResult(raw: Partial<PublishResult> | null): PublishResult {
  return {
    published: raw?.published ?? [],
    skipped: raw?.skipped ?? [],
    preview: raw?.preview ?? [],
    next_number: raw?.next_number ?? 0,
  };
}

export function publishPatches(body: {
  start_number?: number;
  dry_run?: boolean;
  /** 指定要发布的批次；为空则发布所有未发布批次 */
  batch_ids?: string[];
}): Promise<PublishResult> {
  return apiFetch("/api/patches/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((res) => res.json() as Promise<Partial<PublishResult>>)
    .then(normalizePublishResult);
}

/** 删除一个批次下的全部补丁任务 */
export function deletePatchBatch(batchId: string): Promise<{
  deleted: string[];
  batch: string;
  total: number;
}> {
  return apiFetch(`/api/patches/batches/${batchId}`, {
    method: "DELETE",
  }).then((res) => res.json() as Promise<{ deleted: string[]; batch: string; total: number }>);
}

/** 产物文件的预览/下载链接（复用预览端点，已做路径穿越防护） */
export function artifactUrl(relativePath: string): string {
  return `${API_BASE}/api/preview/file/${relativePath.replace(/^\/+/, "")}`;
}

/** 删除一个 MPQ 档案及其批次元数据 */
export function deleteMpqArchive(
  archive: string,
): Promise<{
  deleted: string;
  batch: string;
  source: string;
  size_bytes: number;
  reset_jobs: string[];
}> {
  return apiFetch(`/api/mpq/archives/${archive}`, {
    method: "DELETE",
  }).then(
    (res) =>
      res.json() as Promise<{
        deleted: string;
        batch: string;
        source: string;
        size_bytes: number;
        reset_jobs: string[];
      }>,
  );
}

/** 对一个构建侧 MPQ 档案执行 basic 混淆（dist 已上架档案会被后端拒绝） */
export function obfuscateMpqArchive(
  archive: string,
): Promise<{ rel_path: string; obfuscation: string; obfuscated_at: string }> {
  return apiFetch(`/api/mpq/archives/${archive}/obfuscate`, {
    method: "POST",
  }).then(
    (res) =>
      res.json() as Promise<{
        rel_path: string;
        obfuscation: string;
        obfuscated_at: string;
      }>,
  );
}

export function getPatchJobAudit(jobId: string): Promise<PatchJobAudit> {
  return apiGetJson<PatchJobAudit>(`/api/patches/${jobId}/audit`);
}

export function getPatchJobAuditUrl(jobId: string): string {
  return `${API_BASE}/api/patches/${jobId}/audit`;
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

/* ---------- 生产流程相关只读端点 ---------- */

/** 坐骑补丁预览（所见即所得）：将要写入的 DBC/SQL 记录与全部问题清单 */
export function getPatchPreview(
  resourceType: string,
  resourceId: number,
): Promise<MountPatchPreview> {
  return apiGetJson<MountPatchPreview>(
    `/api/patches/preview/${resourceType}/${resourceId}`,
  );
}

/** 批量补丁预览：与逐个调用等价，但 DBC 只加载一次 */
export function previewPatchBatch(
  resourceIds: number[],
): Promise<MountPatchPreview[]> {
  return apiFetch("/api/patches/preview/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resource_ids: resourceIds }),
  }).then((res) => res.json() as Promise<MountPatchPreview[]>);
}

/** 资源的跨数据源关联校验结果 */
export function getResourceRelationships(
  resourceType: string,
  resourceId: number,
): Promise<ResourceRelationshipReport> {
  return apiGetJson<ResourceRelationshipReport>(
    `/api/resources/${resourceType}/${resourceId}/relationships`,
  );
}

/** 资源在生产流程中的位置与各步状态 */
export function getResourceFlow(
  resourceType: string,
  resourceId: number,
): Promise<ResourceFlowState> {
  return apiGetJson<ResourceFlowState>(
    `/api/resources/${resourceType}/${resourceId}/flow`,
  );
}

/** 单个任务的校验报告切片 */
export function getJobValidationReport(
  jobId: string,
): Promise<ValidationReportOut> {
  return apiGetJson<ValidationReportOut>(
    `/api/patches/jobs/${jobId}/validation-report`,
  );
}

/** 批次的完整校验报告 */
export function getBatchValidationReport(
  batch: string,
): Promise<ValidationReportOut> {
  return apiGetJson<ValidationReportOut>(
    `/api/patches/reports/${batch}/validation-report`,
  );
}

/** 任务的 DBC/SQL 生成计划：stored 读 dry-run 落盘结果，live 现场重算 */
export function getJobPlans(
  jobId: string,
  source: "stored" | "live" = "stored",
): Promise<JobPlansOut> {
  return apiGetJson<JobPlansOut>(
    `/api/patches/jobs/${jobId}/plans?source=${source}`,
  );
}

/** 任务的产物清单（含可下载链接） */
export function getJobArtifacts(jobId: string): Promise<JobArtifactsOut> {
  return apiGetJson<JobArtifactsOut>(`/api/patches/jobs/${jobId}/artifacts`);
}
