import { File, Folder } from "lucide-react";
import type { AssetFile } from "@/shared/types";

interface AssetFileTreeProps {
  title: string;
  icon: React.ReactNode;
  files: AssetFile[];
  activePath?: string;
  onSelect?: (file: AssetFile) => void;
}

export function AssetFileTree({
  title,
  icon,
  files,
  activePath,
  onSelect,
}: AssetFileTreeProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          {icon}
          <span className="card-title">{title}</span>
          <span className="ml-auto text-xs text-text-tertiary">
            {files.length}
          </span>
        </div>
      </div>
      <div className="card-body">
        <ul className="file-tree max-h-80 overflow-auto">
          {files.length === 0 && (
            <li className="py-3 text-sm text-text-secondary">无文件</li>
          )}
          {files.map((file) => {
            const isImage = /\.(png|jpg|jpeg|webp|gif|blp)$/i.test(file.name);
            return (
              <li
                key={file.relative_path}
                className={`file-tree-item cursor-pointer ${
                  activePath === file.relative_path
                    ? "bg-accent-soft text-accent"
                    : ""
                }`}
                onClick={() => onSelect?.(file)}
              >
                {isImage ? (
                  <File className="h-4 w-4 text-accent" />
                ) : (
                  <Folder className="h-4 w-4 text-text-tertiary" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="truncate text-xs text-text-tertiary">
                    {file.relative_path}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
