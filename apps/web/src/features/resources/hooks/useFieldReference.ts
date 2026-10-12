import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllResources } from "@/shared/resources";
import type { Resource } from "@/shared/types";

export interface FieldReferenceStat {
  value: number | string | null;
  ratio: number | null;
  sampleSize: number;
}

const REFERENCE_FIELD_PATHS = [
  "dbc.creature_model_data.flags",
  "dbc.creature_model_data.model_scale",
  "dbc.creature_model_data.collision_width",
  "dbc.creature_model_data.collision_height",
  "dbc.creature_model_data.mount_height",
  "dbc.creature_display_info.scale",
  "dbc.creature_display_info.opacity",
  "dbc.creature_display_info.sound_id",
  "dbc.creature_display_info.size_class",
  "dbc.creature_display_info.blood_id",
  "dbc.creature_display_info.npc_sound_id",
  "dbc.creature_display_info.particle_color_id",
  "dbc.spell.visual_id",
  "dbc.spell.spell_visual_id",
  "dbc.spell.icon_id",
  "dbc.spell.speed",
  "dbc.spell.flight_speed",
  "dbc.spell.swim_speed",
  "dbc.item.class",
  "dbc.item.subclass",
  "dbc.item.material",
  "dbc.item.display_id",
  "dbc.item.inventory_type",
  "dbc.item.sheath",
  "db.creature_template.minlevel",
  "db.creature_template.maxlevel",
  "db.creature_template.faction",
];

function readPath(resource: Resource, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, resource);
}

function normalizeValueKey(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return null;
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }
  return String(value);
}

function computeReferenceStats(
  resources: Resource[],
): Map<string, FieldReferenceStat> {
  const counts = new Map<string, Map<string, number>>();
  for (const path of REFERENCE_FIELD_PATHS) counts.set(path, new Map());

  for (const resource of resources) {
    for (const path of REFERENCE_FIELD_PATHS) {
      const key = normalizeValueKey(readPath(resource, path));
      if (key === null) continue;
      const bucket = counts.get(path)!;
      bucket.set(key, (bucket.get(key) ?? 0) + 1);
    }
  }

  const stats = new Map<string, FieldReferenceStat>();
  for (const [path, bucket] of counts) {
    if (bucket.size === 0) continue;
    let bestKey = "";
    let bestCount = 0;
    let total = 0;
    for (const [key, count] of bucket) {
      total += count;
      if (count > bestCount) {
        bestKey = key;
        bestCount = count;
      }
    }
    stats.set(path, {
      value: bestKey,
      ratio: total > 0 ? bestCount / total : null,
      sampleSize: total,
    });
  }
  return stats;
}

export function useFieldReference(resourceType: Resource["resource_type"]) {
  const { data } = useQuery({
    queryKey: ["field-reference", resourceType],
    queryFn: () => fetchAllResources(resourceType, { added: true }),
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(
    () => computeReferenceStats(data ?? []),
    [data],
  );

  return (path: string): FieldReferenceStat | null => stats.get(path) ?? null;
}
