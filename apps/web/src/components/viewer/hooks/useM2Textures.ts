import { useMemo } from "react";
import { getBlpPreviewUrl } from "@/shared/resources";
import type { ParsedM2 } from "@/lib/m2/types";
import type { ModelPreview } from "@/shared/types";

function extractVariationSuffix(path: string): string | null {
  const name = path.split("/").pop()?.replace(".blp", "") ?? "";
  const lastUnderscore = name.lastIndexOf("_");
  if (lastUnderscore <= 0) {
    return null;
  }
  return name.slice(lastUnderscore + 1).toLowerCase();
}

function resolveSkinTextures(
  selectedPath: string | null | undefined,
  blpFiles: string[],
  modelFolder: string,
): string[] {
  if (!selectedPath) {
    return blpFiles.filter(function (path) {
      return path.toLowerCase().includes(modelFolder.toLowerCase());
    });
  }

  const suffix = extractVariationSuffix(selectedPath);
  if (!suffix) {
    return [selectedPath];
  }

  const matching = blpFiles.filter(function (path) {
    const name = path.split("/").pop()?.replace(".blp", "").toLowerCase() ?? "";
    return name.endsWith(`_${suffix}`);
  });

  return matching.length > 0 ? matching.sort() : [selectedPath];
}

export function useM2Textures(
  parsed: ParsedM2 | null,
  preview: ModelPreview,
  selectedTexture?: string | null,
): Record<number, string> {
  return useMemo(
    function () {
      const urls: Record<number, string> = {};
      if (!parsed) return urls;

      parsed.m2.textures.forEach(function (texture, index) {
        if (texture.type === 0 && texture.filename) {
          const baseName = texture.filename
            .replace(/\\/g, "/")
            .split("/")
            .pop()
            ?.toLowerCase()
            .replace(/\.blp$/, "");
          if (!baseName) return;

          const exactMatch = preview.blp_files.find(function (path) {
            const name = path
              .split("/")
              .pop()
              ?.toLowerCase()
              .replace(/\.blp$/, "");
            return name === baseName;
          });
          const candidate =
            exactMatch ??
            preview.blp_files.find(function (path) {
              return path.toLowerCase().includes(baseName);
            });
          if (candidate) {
            urls[index] = getBlpPreviewUrl(candidate);
          }
        }
      });

      const skinTextures = resolveSkinTextures(
        selectedTexture,
        preview.blp_files,
        preview.model_folder,
      );
      const skinSlots = parsed.m2.textures
        .map(function (texture, index) {
          return { texture, index };
        })
        .filter(function ({ texture, index }) {
          return (
            (texture.type === 11 ||
              texture.type === 12 ||
              texture.type === 13) &&
            !urls[index]
          );
        })
        .map(function ({ index }) {
          return index;
        });

      skinTextures.forEach(function (path, arrayIndex) {
        const slot = skinSlots[arrayIndex];
        if (slot !== undefined) {
          urls[slot] = getBlpPreviewUrl(path);
        }
      });

       
      console.log(
        "[textureUrls] textures:",
        parsed.m2.textures.map(function (t, i) {
          return {
            index: i,
            type: t.type,
            filename: t.filename,
            resolved: urls[i] ?? null,
          };
        }),
        "blp_files:",
        preview.blp_files,
      );

      return urls;
    },
    [parsed, preview.blp_files, preview.model_folder, selectedTexture],
  );
}
