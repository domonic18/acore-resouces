import { Link } from "react-router-dom";
import { FolderTree, Layers, RefreshCw, Eye } from "lucide-react";
import { AssetFileTree } from "@/components/viewer/AssetFileTree";
import { ImageGallery } from "@/components/media/ImageGallery";
import { uniqueFiles } from "@/shared/utils";
import type { AssetFile } from "@/shared/types";

interface ResourceDetailSidebarProps {
  resourceType: string;
  resourceId: number;
  assets:
    | {
        model_folder: string;
        resource_dir?: string;
        m2_files: AssetFile[];
        texture_files: AssetFile[];
        image_files: AssetFile[];
        icon_files: AssetFile[];
        matched_textures: AssetFile[];
      }
    | null
    | undefined;
  selectedImage: AssetFile | null;
  onSelectImage: (file: AssetFile) => void;
  allFiles: AssetFile[];
}

export function ResourceDetailSidebar({
  resourceType,
  resourceId,
  assets,
  selectedImage,
  onSelectImage,
  allFiles,
}: ResourceDetailSidebarProps) {
  const galleryFiles = assets
    ? uniqueFiles([
        ...assets.image_files,
        ...assets.matched_textures,
        ...assets.icon_files,
      ])
    : [];

  return (
    <div className="detail-sidebar">
      <div className="card">
        <div className="card-header">
          <div className="card-title">模型预览</div>
        </div>
        <div className="card-body">
          <ImageGallery
            files={galleryFiles}
            selected={selectedImage}
            onSelect={onSelectImage}
          />
          <div className="preview-toolbar">
            <button className="btn btn-sm w-full" disabled>
              <RefreshCw className="h-4 w-4" /> 刷新
            </button>
            <Link
              to={`/preview/${resourceType}/${resourceId}`}
              className="btn btn-sm btn-primary w-full"
            >
              <Eye className="h-4 w-4" /> 完整预览
            </Link>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">资源文件</div>
        </div>
        <div className="card-body">
          {assets ? (
            <>
              {assets.resource_dir && (
                <div className="file-tree-item mb-1 font-medium text-text-primary">
                  <FolderTree className="h-4 w-4" />
                  {assets.model_folder}
                </div>
              )}
              <AssetFileTree
                title=""
                icon=<Layers className="h-4 w-4" />
                files={allFiles}
              />
            </>
          ) : (
            <p className="text-sm text-text-secondary">暂无文件信息</p>
          )}
        </div>
      </div>
    </div>
  );
}
