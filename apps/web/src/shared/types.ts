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
  spell_wowhead_url: string | null;
  item_wowhead_url: string | null;
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
  created_at: string | null;
  updated_at: string | null;
  drop: DropInfo;
  official_db: OfficialDbInfo;
  dbc: DbcInfo;
  db: DbInfo;
  mount_type?: string | null;
  star_rating?: string | null;
  subtype?: string | null;
  rarity?: string | null;
  tags?: string[];
  duplicate_issues?: DuplicateIssue[];
}

export interface ResourceUpdate {
  name?: string | null;
  icon_name?: string | null;
  spell_icon_name?: string | null;
  spell_wowhead_url?: string | null;
  item_wowhead_url?: string | null;
  mount_type?: string | null;
  star_rating?: string | null;
  subtype?: string | null;
  rarity?: string | null;
  drop?: Partial<DropInfo>;
  dbc_item?: Record<string, unknown>;
  dbc_spell?: Record<string, unknown>;
  db_item_template?: Record<string, unknown>;
  db_creature_template?: Record<string, unknown>;
  debug_passed?: boolean;
  added?: boolean;
}

export interface DuplicateIssueResource {
  id: number;
  resource_type: "mount" | "pet" | "npc";
  model_folder: string;
  name: string | null;
}

export interface DuplicateIssue {
  field: string;
  value: number;
  resources: DuplicateIssueResource[];
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
  anim_files: AssetFile[];
}

export interface ModelPreview {
  model_folder: string;
  resource_type: string;
  status: "available" | "skin_missing" | "not_found";
  m2_files: string[];
  main_m2: string;
  skin_files: string[];
  blp_files: string[];
  anim_files: string[];
  metadata: Record<string, unknown> | null;
}

export interface PatchJob {
  job_id: string;
  created_at: string;
  created_by: string;
  resource_type: string;
  resource_id: number;
  resource_name: string;
  resource_model_folder: string;
  status: "requested" | "generated" | "applied" | "failed";
  input_dir: string;
  output_dir: string;
  artifacts: {
    input: Record<string, string>;
    output: Record<string, string>;
  };
  completed_at: string | null;
  summary: string | null;
}

export interface PatchExportResponse {
  jobs: PatchJob[];
  total: number;
}

export interface Paginated<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}
