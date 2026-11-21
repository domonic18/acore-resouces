/**
 * 校验报告检查项的中文标签。
 *
 * 检查项名来自后端 validate_job（backend/app/services/mount_patch_builder.py），
 * 是稳定的英文标识；这里只做展示层翻译，不参与判定。
 */

export const VALIDATION_CHECK_LABELS: Record<string, string> = {
  spell_id_matches_item_template_spellid_2:
    "法术 ID 与 item_template.spellid_2 一致",
  creature_model_data_id_matches_display_info_model_id:
    "CreatureModelData.ID 与 CreatureDisplayInfo.ModelID 一致",
  creature_display_info_id_matches_creature_template_model:
    "CreatureDisplayInfo.ID 与 creature_template_model 一致",
  creature_display_info_id_matches_creature_model_info_display_id:
    "CreatureDisplayInfo.ID 与 creature_model_info.display_id 一致",
  creature_template_entry_matches_spell_visual_id:
    "creature_template.entry 与 spell.visual_id 一致",
  creature_model_data_path_matches_mpq: "模型路径与 MPQ 内实际文件一致",
  creature_model_data_path_ascii_only: "模型路径为纯 ASCII 且无空格",
  mpq_model_paths_ascii_only: "MPQ 内所有路径为纯 ASCII 且无空格",
  model_folder_sanitized_no_chinese_or_spaces: "model_folder 无中文与空格",
  vehicle_id_matches_creature_template_sql:
    "creature_template.VehicleId 与 vehicle.vehicle_id 一致",
  vehicle_dbc_record_matches_plan: "Vehicle.dbc 记录与计划一致",
  vehicle_seat_count_matches_special_features:
    "载具座位数与 special_features 标注一致",
  spellclick_spell_exists: "登载法术存在于 Spell.dbc",
  npc_spellclick_sql_present: "SQL 计划含 npc_spellclick_spells 记录",
  accessory_vendor_matches_special_features: "商贩挂件与「自带商人」标注一致",
  accessory_repair_matches_special_features: "修理挂件与「修理」标注一致",
  accessory_auctioneer_matches_special_features:
    "拍卖师挂件与「自带拍卖行」标注一致",
  spell_water_walk_effect_matches_special_features:
    "召唤法术第三效果与「水面行走」一致",
  spell_swim_effect_matches_special_features: "游泳光环与「水下骑乘」一致",
};

/** 动态命名的检查项前缀 */
const PREFIX_LABELS: Record<string, string> = {
  vehicle_accessory_seat_in_range: "挂件座位槽位在 Vehicle.dbc 中非零",
};

/** 把检查项名翻译成中文标签；未知项回退为原始名称。 */
export function getValidationCheckLabel(name: string): string {
  if (VALIDATION_CHECK_LABELS[name]) {
    return VALIDATION_CHECK_LABELS[name];
  }
  for (const [prefix, label] of Object.entries(PREFIX_LABELS)) {
    if (name.startsWith(prefix)) {
      return label;
    }
  }
  return name;
}

/**
 * 关联校验规则的中文标签。
 *
 * 规则 key 来自后端 resource_validation.MOUNT_RELATIONSHIPS。
 */
export const RELATIONSHIP_CHECK_LABELS: Record<string, string> = {
  spell_item: "法术与物品一致",
  model_display: "模型数据与显示信息一致",
  display_template_info: "显示信息与生物模板一致",
  entry_visual: "生物 entry 与召唤视觉一致",
};

export function getRelationshipCheckLabel(key: string): string {
  return RELATIONSHIP_CHECK_LABELS[key] ?? key;
}
