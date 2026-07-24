import { apiGetJson } from "@/shared/api";

export interface FileTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  children?: FileTreeNode[];
  truncated?: boolean;
}

export function getFileTree(
  root: "sources" | "resources" = "sources",
  depth: number = 2,
): Promise<FileTreeNode> {
  return apiGetJson(`/api/files/tree?root=${root}&depth=${depth}`);
}

export function getFileTreeChildren(
  root: "sources" | "resources",
  path: string,
  depth: number = 1,
): Promise<FileTreeNode> {
  const relativePath = path.replace(new RegExp(`^${root}/`), "");
  return apiGetJson(
    `/api/files/tree/${root}?path=${encodeURIComponent(relativePath)}&depth=${depth}`,
  );
}
