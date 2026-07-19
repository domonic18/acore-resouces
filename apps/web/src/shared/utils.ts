import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AssetFile } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uniqueFiles(files: AssetFile[]): AssetFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.relative_path)) {
      return false;
    }
    seen.add(file.relative_path);
    return true;
  });
}
