import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderTree } from "@/components/files/FolderTree";
import { getFileTree } from "@/shared/files";

const ROOT_OPTIONS = [
  { value: "sources" as const, label: "资源目录" },
  { value: "resources" as const, label: "数据目录" },
];

const DEPTH_OPTIONS = [
  { value: 1, label: "1 层" },
  { value: 2, label: "2 层" },
  { value: 3, label: "3 层" },
];

export function ResourceFolderPage() {
  const [root, setRoot] = useState<"sources" | "resources">("sources");
  const [depth, setDepth] = useState(2);

  const { data, isLoading, error } = useQuery({
    queryKey: ["file-tree", root, depth],
    queryFn: () => getFileTree(root, depth),
  });

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">资源列表</h1>
        <div className="topbar-actions flex items-center gap-3">
          <select
            className="h-9 rounded-md border border-border bg-bg-surface px-3 text-sm text-text-primary"
            value={root}
            onChange={(e) => setRoot(e.target.value as "sources" | "resources")}
          >
            {ROOT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-border bg-bg-surface px-3 text-sm text-text-primary"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
          >
            {DEPTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {root === "sources" ? "资源文件夹" : "数据文件夹"}
          </div>
        </div>
        <div className="card-body">
          {isLoading && <p className="text-text-secondary">加载中...</p>}
          {error && (
            <p className="text-danger">
              {error instanceof Error ? error.message : "加载失败"}
            </p>
          )}
          {data && data.children && <FolderTree nodes={data.children} />}
          {data && !data.children?.length && (
            <p className="text-text-secondary">暂无文件</p>
          )}
        </div>
      </div>
    </div>
  );
}
