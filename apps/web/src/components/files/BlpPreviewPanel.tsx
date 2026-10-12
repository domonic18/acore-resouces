import { useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { getBlpPreviewUrl, getFilePreviewUrl } from "@/shared/resources";

interface BlpPreviewPanelProps {
  path: string;
  name: string;
}

function getImagePreviewUrl(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".blp")) {
    return getBlpPreviewUrl(path, 1024);
  }
  return getFilePreviewUrl(path);
}

export function BlpPreviewPanel({ path, name }: BlpPreviewPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const url = getImagePreviewUrl(path);

  return (
    <div className="flex h-full flex-col">
      <div className="panel-header">{name}</div>
      <div className="panel-body flex flex-1 items-center justify-center p-4">
        {loading && !error && (
          <div className="flex flex-col items-center gap-2 text-text-tertiary">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">加载图片中...</span>
          </div>
        )}
        {error ? (
          <div className="flex flex-col items-center gap-2 text-danger">
            <ImageOff className="h-10 w-10" />
            <span className="text-sm">无法加载图片</span>
          </div>
        ) : (
          <img
            src={url}
            alt={name}
            className="max-h-full max-w-full object-contain"
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
          />
        )}
      </div>
      <div className="panel-footer truncate text-xs text-text-tertiary">
        {path}
      </div>
    </div>
  );
}
