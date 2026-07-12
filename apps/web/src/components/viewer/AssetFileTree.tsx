import { File } from 'lucide-react';
import type { AssetFile } from '@/shared/types';

interface AssetFileTreeProps {
  title: string;
  icon: React.ReactNode;
  files: AssetFile[];
}

export function AssetFileTree({ title, icon, files }: AssetFileTreeProps) {
  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-2 border-b bg-muted px-4 py-2 font-medium">
        {icon}
        {title}
        <span className="ml-auto text-xs text-muted-foreground">{files.length}</span>
      </div>
      <ul className="max-h-80 overflow-auto divide-y">
        {files.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted-foreground">无文件</li>
        )}
        {files.map((file) => (
          <li key={file.relative_path} className="flex items-start gap-2 px-4 py-2 text-sm">
            <File className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate font-medium">{file.name}</p>
              <p className="truncate text-xs text-muted-foreground">{file.relative_path}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
