import { apiGetJson } from "@/shared/api";

export interface FileTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  children?: FileTreeNode[];
}

export function getFileTree(
  root: "sources" | "resources" = "sources",
  depth: number = 2,
): Promise<FileTreeNode> {
  return apiGetJson(`/api/files/tree?root=${root}&depth=${depth}`);
}
