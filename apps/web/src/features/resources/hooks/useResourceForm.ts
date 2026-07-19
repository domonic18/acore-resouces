import { useEffect, useMemo, useState } from "react";
import type { Resource } from "@/shared/types";

export interface FormState {
  name: string;
  mount_type: string;
  star_rating: string;
  subtype: string;
  rarity: string;
  drop_entry: string | number;
  drop_instance: string;
  drop_boss: string;
  drop_rate: string | number;
  debug_passed: boolean;
  added: boolean;
}

export function buildForm(resource?: Resource): FormState {
  return {
    name: resource?.official_db.name || resource?.name || "",
    mount_type: resource?.mount_type || "",
    star_rating: resource?.star_rating || "",
    subtype: resource?.subtype || "",
    rarity: resource?.rarity || "",
    drop_entry: resource?.drop.entry ?? "",
    drop_instance: resource?.drop.instance ?? "",
    drop_boss: resource?.drop.boss ?? "",
    drop_rate: resource?.drop.rate ?? "",
    debug_passed: resource?.debug_passed ?? false,
    added: resource?.added ?? false,
  };
}

export function useResourceForm(resource?: Resource) {
  const [form, setForm] = useState<FormState>(() => buildForm(resource));
  const [itemIcon, setItemIcon] = useState(
    resource?.official_db.icon_name || "",
  );
  const [spellIcon, setSpellIcon] = useState(
    resource?.official_db.spell_icon_name || "",
  );
  const [itemDbc, setItemDbc] = useState<Record<string, unknown>>(
    resource?.dbc.item ?? {},
  );
  const [itemDb, setItemDb] = useState<Record<string, unknown>>(
    resource?.db.item_template ?? {},
  );
  const [spellDbc, setSpellDbc] = useState<Record<string, unknown>>(
    resource?.dbc.spell ?? {},
  );
  const [spellDb, setSpellDb] = useState<Record<string, unknown>>(
    resource?.db.creature_template ?? {},
  );

  useEffect(() => {
    if (!resource) return;
    setForm(buildForm(resource));
    setItemIcon(resource.official_db.icon_name || "");
    setSpellIcon(resource.official_db.spell_icon_name || "");
    setItemDbc(resource.dbc.item ?? {});
    setItemDb(resource.db.item_template ?? {});
    setSpellDbc(resource.dbc.spell ?? {});
    setSpellDb(resource.db.creature_template ?? {});
  }, [resource]);

  const updateField = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const hasChanges = useMemo(() => {
    if (!resource) return false;
    const baseForm = buildForm(resource);
    if (JSON.stringify(form) !== JSON.stringify(baseForm)) return true;
    if (itemIcon !== (resource.official_db.icon_name || "")) return true;
    if (spellIcon !== (resource.official_db.spell_icon_name || "")) return true;
    if (JSON.stringify(itemDbc) !== JSON.stringify(resource.dbc.item ?? {}))
      return true;
    if (
      JSON.stringify(itemDb) !== JSON.stringify(resource.db.item_template ?? {})
    )
      return true;
    if (JSON.stringify(spellDbc) !== JSON.stringify(resource.dbc.spell ?? {}))
      return true;
    if (
      JSON.stringify(spellDb) !==
      JSON.stringify(resource.db.creature_template ?? {})
    )
      return true;
    return false;
  }, [form, resource, itemIcon, spellIcon, itemDbc, itemDb, spellDbc, spellDb]);

  const liveDbc = useMemo(
    () => ({
      ...resource?.dbc,
      item: itemDbc,
      spell: spellDbc,
    }),
    [resource?.dbc, itemDbc, spellDbc],
  );

  const liveDb = useMemo(
    () => ({
      ...resource?.db,
      item_template: itemDb,
      creature_template: spellDb,
    }),
    [resource?.db, itemDb, spellDb],
  );

  return {
    form,
    setForm,
    updateField,
    itemIcon,
    setItemIcon,
    spellIcon,
    setSpellIcon,
    itemDbc,
    setItemDbc,
    itemDb,
    setItemDb,
    spellDbc,
    setSpellDbc,
    spellDb,
    setSpellDb,
    hasChanges,
    liveDbc,
    liveDb,
  };
}
