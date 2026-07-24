import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { getFileTreeChildren } from "@/shared/files";
import type { FileTreeNode } from "@/shared/files";

interface FolderTreeProps {
  nodes: FileTreeNode[];
  root: "sources" | "resources";
}

function TreeNode({
  node,
  root,
  depth = 0,
}: {
  node: FileTreeNode;
  root: "sources" | "resources";
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDirectory = node.type === "directory";
  const hasKnownChildren = node.children !== undefined;
  const initialEmpty = hasKnownChildren && node.children!.length === 0;
  const shouldFetch = isDirectory && expanded && !hasKnownChildren;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["file-tree-children", root, node.path],
    queryFn: () => getFileTreeChildren(root, node.path),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });

  const children = data?.children ?? node.children;
  const hasChildren = isDirectory && (children?.length ?? 0) > 0;
  const showChevron =
    isDirectory && (!hasKnownChildren || hasChildren || initialEmpty);

  return (
    <div>
      <button
        type="button"
        className={cn(
          "file-tree-item w-full",
          isDirectory && "hover:bg-bg-hover",
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => isDirectory && setExpanded((v) => !v)}
      >
        {showChevron ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-tertiary" />
          )
        ) : (
          <span className="h-4 w-4" />
        )}
        {isDirectory ? (
          <Folder className="h-4 w-4 text-accent" />
        ) : (
          <File className="h-4 w-4 text-text-tertiary" />
        )}
        <span className="truncate text-left">{node.name}</span>
        {node.truncated && (
          <span className="ml-1 text-[10px] text-text-tertiary">截断</span>
        )}
      </button>
      {expanded && isDirectory && (
        <div>
          {isLoading && (
            <div
              className="flex items-center gap-2 py-2 text-sm text-text-tertiary"
              style={{ paddingLeft: `${28 + depth * 16}px` }}
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          )}
          {error && (
            <div
              className="flex items-center gap-2 py-2 text-sm text-danger"
              style={{ paddingLeft: `${28 + depth * 16}px` }}
            >
              <AlertCircle className="h-4 w-4" />
              加载失败
              <button
                type="button"
                className="ml-2 text-xs underline hover:text-danger/80"
                onClick={() => refetch()}
              >
                重试
              </button>
            </div>
          )}
          {!isLoading &&
            !error &&
            hasChildren &&
            children!.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                root={root}
                depth={depth + 1}
              />
            ))}
          {!isLoading && !error && initialEmpty && (
            <div
              className="py-2 text-sm text-text-tertiary"
              style={{ paddingLeft: `${28 + depth * 16}px` }}
            >
              空文件夹
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FolderTree({ nodes, root }: FolderTreeProps) {
  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} root={root} />
      ))}
    </div>
  );
}
