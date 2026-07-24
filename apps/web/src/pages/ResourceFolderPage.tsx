import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, ImageOff, Box } from "lucide-react";
import { FolderTree } from "@/components/files/FolderTree";
import { BlpPreviewPanel } from "@/components/files/BlpPreviewPanel";
import { ModelViewer } from "@/components/viewer/ModelViewer";
import { getFileTree, parseModelPath } from "@/shared/files";
import { getModelPreview } from "@/shared/resources";
import type { FileTreeNode } from "@/shared/files";

const ROOT_OPTIONS = [
  { value: "sources" as const, label: "资源目录" },
  { value: "resources" as const, label: "数据目录" },
];

const DEPTH_OPTIONS = [
  { value: 1, label: "1 层" },
  { value: 2, label: "2 层" },
  { value: 3, label: "3 层" },
];

function getParentPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "";
}

function isBlp(node: FileTreeNode): boolean {
  return node.name.toLowerCase().endsWith(".blp");
}

function isImage(node: FileTreeNode): boolean {
  return /\.(png|jpg|jpeg|webp|gif|blp)$/i.test(node.name.toLowerCase());
}

function isM2(node: FileTreeNode): boolean {
  return node.name.toLowerCase().endsWith(".m2");
}

export function ResourceFolderPage() {
  const [root, setRoot] = useState<"sources" | "resources">("sources");
  const [depth, setDepth] = useState(2);
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null);
  const [selectedTexture, setSelectedTexture] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["file-tree", root, depth],
    queryFn: () => getFileTree(root, depth),
  });

  const modelInfo =
    selectedFile && isM2(selectedFile)
      ? parseModelPath(selectedFile.path)
      : null;

  const { data: modelPreview, isLoading: modelLoading } = useQuery({
    queryKey: [
      "folder-model-preview",
      modelInfo?.modelFolder,
      modelInfo?.resourceType,
    ],
    queryFn: () =>
      getModelPreview(modelInfo!.modelFolder, modelInfo!.resourceType),
    enabled: !!modelInfo,
  });

  function handleRootChange(value: "sources" | "resources") {
    setRoot(value);
    setSelectedFile(null);
    setSelectedTexture(null);
  }

  function handleDepthChange(value: number) {
    setDepth(value);
    setSelectedFile(null);
    setSelectedTexture(null);
  }

  function handleSelectFile(node: FileTreeNode) {
    if (isM2(node)) {
      setSelectedFile(node);
      setSelectedTexture(null);
      return;
    }

    if (isBlp(node)) {
      if (
        selectedFile &&
        isM2(selectedFile) &&
        getParentPath(selectedFile.path) === getParentPath(node.path)
      ) {
        setSelectedTexture(node.path);
        return;
      }
      setSelectedFile(node);
      setSelectedTexture(null);
      return;
    }

    if (isImage(node)) {
      setSelectedFile(node);
      setSelectedTexture(null);
      return;
    }

    setSelectedFile(node);
    setSelectedTexture(null);
  }

  function renderPreview() {
    if (!selectedFile) {
      return (
        <div className="flex h-full flex-col items-center justify-center text-text-tertiary">
          <FolderOpen className="mb-4 h-16 w-16" />
          <p>在左侧选择一个文件以预览</p>
          <p className="mt-1 text-sm">
            支持 .blp/.png/.jpg/.webp/.gif 图片和 .m2 模型
          </p>
        </div>
      );
    }

    if (isImage(selectedFile)) {
      return (
        <BlpPreviewPanel path={selectedFile.path} name={selectedFile.name} />
      );
    }

    if (isM2(selectedFile)) {
      if (!modelInfo) {
        return (
          <div className="flex h-full flex-col items-center justify-center text-danger">
            <Box className="mb-4 h-12 w-12" />
            <p>无法识别该模型路径</p>
          </div>
        );
      }

      if (modelLoading) {
        return (
          <div className="flex h-full flex-col items-center justify-center text-text-tertiary">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="mt-3 text-sm">加载模型预览...</p>
          </div>
        );
      }

      if (!modelPreview || modelPreview.status === "not_found") {
        return (
          <div className="flex h-full flex-col items-center justify-center text-danger">
            <Box className="mb-4 h-12 w-12" />
            <p>模型暂不可用</p>
            <p className="mt-1 text-sm text-text-tertiary">
              状态：{modelPreview?.status || "未知"}
            </p>
          </div>
        );
      }

      return (
        <div className="flex h-full flex-col">
          <div className="panel-header">{selectedFile.name}</div>
          <div className="viewer-canvas relative flex-1">
            <ModelViewer
              preview={modelPreview}
              resourceType={modelInfo.resourceType}
              selectedTexture={selectedTexture}
            />
          </div>
          {selectedTexture && (
            <div className="panel-footer truncate text-xs text-text-tertiary">
              覆盖贴图：{selectedTexture}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center text-text-tertiary">
        <ImageOff className="mb-4 h-12 w-12" />
        <p>该文件类型暂不支持预览</p>
        <p className="mt-1 text-sm">{selectedFile.name}</p>
      </div>
    );
  }

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">资源列表</h1>
        <div className="topbar-actions flex items-center gap-3">
          <select
            className="h-9 rounded-md border border-border bg-bg-surface px-3 text-sm text-text-primary"
            value={root}
            onChange={(e) =>
              handleRootChange(e.target.value as "sources" | "resources")
            }
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
            onChange={(e) => handleDepthChange(Number(e.target.value))}
          >
            {DEPTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div
        className="grid gap-5 lg:grid-cols-[320px_1fr]"
        style={{ minHeight: "600px", height: "calc(100vh - 128px)" }}
      >
        <div className="viewer-panel flex flex-col overflow-hidden">
          <div className="panel-header">
            {root === "sources" ? "资源文件夹" : "数据文件夹"}
          </div>
          <div className="panel-body overflow-y-auto p-2">
            {isLoading && <p className="text-text-secondary">加载中...</p>}
            {error && (
              <p className="text-danger">
                {error instanceof Error ? error.message : "加载失败"}
              </p>
            )}
            {data && data.children && (
              <FolderTree
                nodes={data.children}
                root={root}
                selectedPath={selectedFile?.path}
                onSelectFile={handleSelectFile}
              />
            )}
            {data && !data.children?.length && (
              <p className="text-text-secondary">暂无文件</p>
            )}
          </div>
        </div>

        <div className="viewer-panel flex flex-col overflow-hidden">
          {renderPreview()}
        </div>
      </div>
    </div>
  );
}
