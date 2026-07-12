import { useState } from "react";
import { getBlpPreviewUrl, getIconPreviewUrl } from "@/shared/resources";
import type { Resource } from "@/shared/types";

const TYPE_EMOJI: Record<string, string> = {
  mount: "🐎",
  pet: "🐾",
  npc: "🧙",
};

export function ResourceThumb({
  resource,
  size = 40,
}: {
  resource: Resource;
  size?: number;
}) {
  const [imageError, setImageError] = useState(false);

  let src: string | null = null;
  if (resource.preview_image && !imageError) {
    src = getBlpPreviewUrl(resource.preview_image, size);
  } else if (resource.official_db.icon_name && !imageError) {
    src = getIconPreviewUrl(resource.official_db.icon_name, size);
  } else if (resource.official_db.spell_icon_name && !imageError) {
    src = getIconPreviewUrl(resource.official_db.spell_icon_name, size);
  }

  return (
    <div
      className="resource-thumb"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {src ? (
        <img
          src={src}
          alt={resource.name || resource.model_folder}
          className="h-full w-full rounded-md object-contain"
          onError={() => setImageError(true)}
        />
      ) : (
        <span>{TYPE_EMOJI[resource.resource_type] || "📦"}</span>
      )}
    </div>
  );
}
