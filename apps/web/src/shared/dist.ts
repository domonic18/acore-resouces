import { apiFetch, apiGetJson } from "@/shared/api";

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

/**
 * 玩家下载补丁：fetch + Authorization 头取回后以 blob 触发浏览器保存。
 * 避免 JWT 进入 URL（服务器访问日志 / 浏览器历史），大文件 blob 由浏览器
 * 自行落盘缓存，不长期占用 JS 堆。
 */
export async function downloadDistFile(relativePath: string): Promise<void> {
  const response = await apiFetch(`/api/dist/download/${relativePath}`, {
    headers: { Accept: "*/*" },
  });
  const blob = await response.blob();
  const filename =
    decodeURIComponent(relativePath.split("/").pop() ?? "") || "patch.mpq";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
