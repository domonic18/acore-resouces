import { useState } from "react";
import { Image } from "lucide-react";
import { getIconPreviewUrl } from "@/shared/resources";
import type { Resource } from "@/shared/types";

export function ResourceThumb({
  resource,
  size = 40,
}: {
  resource: Resource;
  size?: number;
}) {
  const [imageError, setImageError] = useState(false);

  const iconName =
    resource.official_db.icon_name || resource.official_db.spell_icon_name;
  const src = iconName && !imageError ? getIconPreviewUrl(iconName, size) : null;

  return (
    <div
      className="resource-thumb"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt={resource.name || resource.model_folder}
          className="h-full w-full rounded-md object-contain"
          onError={() => setImageError(true)}
        />
      ) : (
        <Image className="h-5 w-5 text-text-tertiary" />
      )}
    </div>
  );
}
