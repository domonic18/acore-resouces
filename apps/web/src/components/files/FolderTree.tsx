import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  Image,
  Box,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { getFileTreeChildren } from "@/shared/files";
import type { FileTreeNode } from "@/shared/files";

interface FolderTreeProps {
  nodes: FileTreeNode[];
  root: "sources" | "resources";
  selectedPath?: string;
  onSelectFile?: (node: FileTreeNode) => void;
}

function getFileIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".blp")) return <Image className="h-4 w-4 text-accent" />;
  if (lower.endsWith(".m2")) return <Box className="h-4 w-4 text-purple-400" />;
  return <File className="h-4 w-4 text-text-tertiary" />;
}

function TreeNode({
  node,
  root,
  depth = 0,
  selectedPath,
  onSelectFile,
}: {
  node: FileTreeNode;
  root: "sources" | "resources";
  depth?: number;
  selectedPath?: string;
  onSelectFile?: (node: FileTreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDirectory = node.type === "directory";
  const isSelected = selectedPath === node.path;
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

  function handleClick() {
    if (isDirectory) {
      setExpanded((v) => !v);
      return;
    }
    onSelectFile?.(node);
  }

  return (
    <div>
      <button
        type="button"
        className={cn(
          "file-tree-item w-full",
          isDirectory && "hover:bg-bg-hover",
          isSelected && "bg-accent-soft text-accent",
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
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
          getFileIcon(node.name)
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
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
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

export function FolderTree({
  nodes,
  root,
  selectedPath,
  onSelectFile,
}: FolderTreeProps) {
  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          root={root}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}
