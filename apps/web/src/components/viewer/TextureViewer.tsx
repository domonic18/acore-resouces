import { getBlpPreviewUrl } from "@/shared/resources";

interface TextureViewerProps {
  path: string;
  label?: string;
  size?: number;
  active?: boolean;
  onClick?: () => void;
}

export function TextureViewer({
  path,
  label,
  size = 96,
  active,
  onClick,
}: TextureViewerProps) {
  const url = getBlpPreviewUrl(path, size);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`texture-item flex-col gap-2 ${active ? "active" : ""}`}
      style={{ width: "100%" }}
    >
      <img
        src={url}
        alt={label || path}
        className="h-16 w-16 rounded object-contain"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      {label && (
        <p className="truncate max-w-full px-1 text-center text-[10px] text-text-secondary">
          {label}
        </p>
      )}
    </button>
  );
}
