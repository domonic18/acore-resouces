export interface DropInfo {
  entry: number | null;
  instance: string | null;
  boss: string | null;
  rate: number | null;
}

export interface OfficialDbInfo {
  name: string | null;
  spell_icon_name: string | null;
  icon_name: string | null;
}

export interface DbcInfo {
  creature_model_data: Record<string, unknown>;
  creature_display_info: Record<string, unknown>;
  spell: Record<string, unknown>;
  item: Record<string, unknown>;
}

export interface DbInfo {
  creature_template: Record<string, unknown>;
  creature_model_info: Record<string, unknown>;
  item_template: Record<string, unknown>;
}

export interface Resource {
  id: number;
  resource_type: "mount" | "pet" | "npc";
  model_folder: string;
  name: string;
  preview_image: string | null;
  debug_passed: boolean;
  added: boolean;
  drop: DropInfo;
  official_db: OfficialDbInfo;
  dbc: DbcInfo;
  db: DbInfo;
  mount_type?: string | null;
  star_rating?: string | null;
  subtype?: string | null;
  rarity?: string | null;
}

export interface PaginatedResources {
  total: number;
  page: number;
  page_size: number;
  items: Resource[];
}

export interface AssetFile {
  name: string;
  relative_path: string;
  file_type: string;
}

export interface ResourceAssets {
  model_folder: string;
  resource_dir: string;
  exists: boolean;
  m2_files: AssetFile[];
  texture_files: AssetFile[];
  image_files: AssetFile[];
  icon_files: AssetFile[];
  matched_textures: AssetFile[];
}

export interface ModelPreview {
  model_folder: string;
  resource_type: string;
  status: string;
  m2_files: string[];
  main_m2: string;
  metadata: Record<string, unknown> | null;
  conversion: {
    status: string;
    output_dir: string | null;
    manifest: Record<string, unknown> | null;
    error: string | null;
  };
}
