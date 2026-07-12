import { getBlpPreviewUrl } from '@/shared/resources';

interface TextureViewerProps {
  path: string;
  label?: string;
  size?: number;
}

export function TextureViewer({ path, label, size = 128 }: TextureViewerProps) {
  const url = getBlpPreviewUrl(path, size);

  return (
    <div className="rounded-md border p-2">
      <img
        src={url}
        alt={label || path}
        className="mx-auto h-32 w-32 rounded object-contain"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
      {label && <p className="mt-2 truncate text-center text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}
