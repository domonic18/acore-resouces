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

const TYPE_MAP: Record<string, string> = {
  mounts: "mount",
  pets: "pet",
  npcs: "npc",
};

export function parseModelPath(
  path: string,
): { resourceType: string; modelFolder: string } | null {
  const parts = path.split("/");
  if (parts.length < 4) return null;
  const type = TYPE_MAP[parts[1]];
  if (!type) return null;
  return { resourceType: type, modelFolder: parts[2] };
}
