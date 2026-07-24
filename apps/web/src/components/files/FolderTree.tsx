import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, File } from "lucide-react";
import type { FileTreeNode } from "@/shared/files";

interface FolderTreeProps {
  nodes: FileTreeNode[];
}

function TreeNode({ node, depth = 0 }: { node: FileTreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDirectory = node.type === "directory";
  const hasChildren = isDirectory && (node.children?.length ?? 0) > 0;

  return (
    <div>
      <button
        type="button"
        className="file-tree-item w-full"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => isDirectory && setExpanded((v) => !v)}
      >
        {hasChildren ? (
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
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({ nodes }: FolderTreeProps) {
  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} />
      ))}
    </div>
  );
}
