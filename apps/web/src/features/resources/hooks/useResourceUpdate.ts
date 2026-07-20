import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateResource } from "@/shared/resources";
import { buildForm, type FormState } from "./useResourceForm";
import { normalizeInt, normalizeFloat } from "../lib/detail-helpers";
import type { Resource, ResourceUpdate } from "@/shared/types";

interface SaveableState {
  form: FormState;
  itemIcon: string;
  spellIcon: string;
  itemWowheadUrl: string;
  spellWowheadUrl: string;
  itemDbc: Record<string, unknown>;
  itemDb: Record<string, unknown>;
  spellDbc: Record<string, unknown>;
  spellDb: Record<string, unknown>;
}

export function useResourceUpdate(resourceType: string, resourceId: number) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (update: ResourceUpdate) =>
      updateResource(resourceType, resourceId, update),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["resource", resourceType, resourceId],
      });
      queryClient.invalidateQueries({ queryKey: ["resources-all"] });
    },
  });

  const handleSave = (resource: Resource, state: SaveableState) => {
    const {
      form,
      itemIcon,
      spellIcon,
      itemWowheadUrl,
      spellWowheadUrl,
      itemDbc,
      itemDb,
      spellDbc,
      spellDb,
    } = state;

    const update: ResourceUpdate = {};
    const baseline = buildForm(resource);

    if (form.name !== baseline.name) update.name = form.name || null;
    if (form.mount_type !== baseline.mount_type) {
      update.mount_type = form.mount_type || null;
    }
    if (form.star_rating !== baseline.star_rating) {
      update.star_rating = form.star_rating || null;
    }
    if (form.subtype !== baseline.subtype)
      update.subtype = form.subtype || null;
    if (form.rarity !== baseline.rarity) update.rarity = form.rarity || null;
    if (
      form.debug_passed !== baseline.debug_passed ||
      form.added !== baseline.added
    ) {
      update.debug_passed = form.debug_passed;
      update.added = form.added;
    }

    const dropUpdate: ResourceUpdate["drop"] = {};
    const entry = normalizeInt(form.drop_entry);
    if (entry !== resource.drop.entry) dropUpdate.entry = entry;
    const rate = normalizeFloat(form.drop_rate);
    if (rate !== resource.drop.rate) dropUpdate.rate = rate;
    if (form.drop_instance !== (resource.drop.instance ?? "")) {
      dropUpdate.instance = form.drop_instance || null;
    }
    if (form.drop_boss !== (resource.drop.boss ?? "")) {
      dropUpdate.boss = form.drop_boss || null;
    }
    if (Object.keys(dropUpdate).length > 0) {
      update.drop = dropUpdate;
    }

    if (itemIcon !== (resource.official_db.icon_name || "")) {
      update.icon_name = itemIcon || null;
    }
    if (spellIcon !== (resource.official_db.spell_icon_name || "")) {
      update.spell_icon_name = spellIcon || null;
    }
    if (itemWowheadUrl !== (resource.official_db.item_wowhead_url || "")) {
      update.item_wowhead_url = itemWowheadUrl || null;
    }
    if (spellWowheadUrl !== (resource.official_db.spell_wowhead_url || "")) {
      update.spell_wowhead_url = spellWowheadUrl || null;
    }

    if (JSON.stringify(itemDbc) !== JSON.stringify(resource.dbc.item ?? {})) {
      update.dbc_item = itemDbc;
    }
    if (
      JSON.stringify(itemDb) !== JSON.stringify(resource.db.item_template ?? {})
    ) {
      update.db_item_template = itemDb;
    }
    if (JSON.stringify(spellDbc) !== JSON.stringify(resource.dbc.spell ?? {})) {
      update.dbc_spell = spellDbc;
    }
    if (
      JSON.stringify(spellDb) !==
      JSON.stringify(resource.db.creature_template ?? {})
    ) {
      update.db_creature_template = spellDb;
    }

    updateMutation.mutate(update);
  };

  return { updateMutation, handleSave };
}
