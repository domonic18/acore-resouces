import { Box, AlertCircle } from "lucide-react";
import { getBlpPreviewUrl, getFilePreviewUrl } from "@/shared/resources";
import { cn } from "@/shared/utils";
import type { AssetFile } from "@/shared/types";

interface ImageGalleryProps {
  files: AssetFile[];
  selected: AssetFile | null;
  onSelect: (file: AssetFile) => void;
  variant?: "default" | "viewer";
}

function filePreviewUrl(file: AssetFile): string {
  if (file.file_type === "blp") {
    return getBlpPreviewUrl(file.relative_path, 512);
  }
  return getFilePreviewUrl(file.relative_path);
}

export function ImageGallery({
  files,
  selected,
  onSelect,
  variant = "default",
}: ImageGalleryProps) {
  if (files.length === 0) {
    if (variant === "viewer") {
      return (
        <div className="preview-placeholder">
          <AlertCircle className="h-12 w-12 text-text-tertiary" />
          <p>没有图片文件</p>
        </div>
      );
    }
    return (
      <div className="preview-frame">
        <div className="preview-placeholder">
          <Box className="h-12 w-12" />
          <p>未找到模型图片</p>
        </div>
      </div>
    );
  }

  const current = selected ?? files[0];

  const mainImage = (
    <img
      src={filePreviewUrl(current)}
      alt={current.name}
      className="relative z-10 max-h-full max-w-full rounded-md object-contain"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );

  const thumbnails = files.map((file) => (
    <button
      key={file.relative_path}
      type="button"
      onClick={() => onSelect(file)}
      className={cn(
        "shrink-0 overflow-hidden rounded-md border object-cover transition-all",
        variant === "viewer" ? "h-12 w-12" : "h-14 w-14",
        current.relative_path === file.relative_path
          ? "border-accent"
          : "border-border hover:border-border-hover",
      )}
    >
      <img
        src={filePreviewUrl(file)}
        alt={file.name}
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </button>
  ));

  if (variant === "viewer") {
    return (
      <>
        <div className="viewer-canvas">{mainImage}</div>
        <div className="viewer-toolbar flex-wrap">{thumbnails}</div>
      </>
    );
  }

  return (
    <div>
      <div className="preview-frame">{mainImage}</div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{thumbnails}</div>
    </div>
  );
}
