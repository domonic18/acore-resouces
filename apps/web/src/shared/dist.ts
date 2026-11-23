import { API_BASE, apiFetch, apiGetJson } from "@/shared/api";

/** dist 树节点（与旧分发站 /api/dist/tree 同形） */
export interface DistTreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  meta: DistBatchMeta | DistFileMeta | null;
  children: DistTreeNode[];
}

export interface DistBatchMeta {
  batch: string;
  obfuscation: string | null;
  generated_at: string | null;
  mount_count: number | null;
  file_count: number | null;
  patch_number: number | null;
  patch_file: string | null;
  size_bytes: number | null;
  md5: string | null;
  sha256: string | null;
  has_mpq: boolean;
  has_changelog: boolean;
}

export interface DistFileMeta {
  size_bytes?: number;
  md5?: string | null;
  sha256?: string | null;
  patch_number?: number | null;
}

/** admin 视角批次（含未上架目录） */
export interface DistBatch extends DistBatchMeta {}

export interface DistAdminBatches {
  batches: DistBatch[];
  orphans: string[];
}

export function getDistTree(): Promise<DistTreeNode> {
  return apiGetJson<DistTreeNode>("/api/dist/tree");
}

export function getDistChangelog(
  batch: string,
): Promise<{ batch: string; changelog: string }> {
  return apiGetJson(`/api/dist/changelog/${encodeURIComponent(batch)}`);
}

/** admin：全部批次（含未上架/损坏目录与孤儿目录） */
export function getDistAdminBatches(): Promise<DistAdminBatches> {
  return apiGetJson<DistAdminBatches>("/api/dist/batches");
}

/** admin：下线批次（删除 dist 下整个批次目录，玩家立即不可见） */
export function deleteDistBatch(
  batch: string,
): Promise<{ batch: string; existed: boolean; freed_bytes: number }> {
  return apiFetch(`/api/dist/batches/${encodeURIComponent(batch)}`, {
    method: "DELETE",
  }).then(
    (res) =>
      res.json() as Promise<{
        batch: string;
        existed: boolean;
        freed_bytes: number;
      }>,
  );
}

/** 玩家下载链接：浏览器 <a href> 带不了 Authorization 头，经 ?token= 兜底鉴权 */
export function distDownloadUrl(relativePath: string, token: string): string {
  return `${API_BASE}/api/dist/download/${relativePath}?token=${encodeURIComponent(token)}`;
}
