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
  dbc_creature_model_data?: Record<string, unknown>;
  dbc_creature_display_info?: Record<string, unknown>;
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
  updated_at: string | null;
  artifacts: {
    // 后端 job.json 的 sql_files 等值为数组，此处只透传不约束结构
    output: Record<string, unknown>;
  };
  completed_at: string | null;
  summary: string | null;
}

export interface PatchExportResponse {
  jobs: PatchJob[];
  total: number;
}

export interface PatchBuildResult {
  jobs: string[];
  sql_files: string[];
  mpq_path: string;
  report_path: string;
  audit_path: string;
  manifest_path: string;
  dry_run: boolean;
}

export interface BuildStatus {
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  result: PatchBuildResult | null;
  error: string | null;
}

export interface PublishResult {
  published: { batch: string; path: string }[];
  skipped: string[];
  next_number: number;
}

export interface AuditDbcEntry {
  dbc_file: string;
  record_id: number;
  job_id: string;
  action: string;
  action_taken: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export interface AuditSqlTable {
  name: string;
  operation: string;
  records: Record<string, unknown>[];
}

export interface AuditSqlEntry {
  job_id: string;
  output_sql_file: string;
  status: string;
  tables: AuditSqlTable[];
}

export interface AuditManifestFile {
  path: string;
  size_bytes: number;
  sha256: string;
  kind: string;
}

export interface AuditMpqSummary {
  batch: string;
  path: string;
  obfuscation: string;
  file_count: number;
  counts_by_kind: Record<string, number>;
  files: AuditManifestFile[];
  diff: { added: string[]; replaced: string[]; unchanged: string[] } | null;
}

export interface PatchJobAudit {
  job_id: string;
  resource_name: string;
  model_folder: string | null;
  report: { batch: string | null; generated_at: string | null; path: string };
  dbc: AuditDbcEntry[];
  sql: AuditSqlEntry | null;
  mpq: AuditMpqSummary | null;
}

export interface CleanTarget {
  path: string;
  size_bytes: number;
  reason: string;
}

export interface CleanSkipItem {
  path: string;
  reason: string;
}

export interface CleanResult {
  dry_run: boolean;
  targets: CleanTarget[];
  skipped: CleanSkipItem[];
  total_size_bytes: number;
  errors: { path: string; error: string }[];
}

export interface SystemInfo {
  paths: {
    project_root: string;
    data_dir: string;
    resources_dir: string;
    sources_dir: string;
    workspace_dir: string;
    patch_jobs_dir: string;
    acore_sql_updates_dir: string | null;
    logs_dir: string;
    db_file: string;
  };
  counts: { mounts: number; pets: number; npcs: number };
  health: { registry_exists: boolean; db_exists: boolean };
}

export interface Paginated<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

export interface ItemDisplayInfoEntry {
  id: number;
  icon_name: string | null;
}

export interface ItemDisplayInfoPage {
  items: ItemDisplayInfoEntry[];
  total: number;
}

export interface DbcFieldDef {
  name: string;
  type: string;
}

export interface DbcFileInfo {
  name: string;
  size: number;
  mtime: string;
  record_count: number | null;
  schema_registered: boolean;
  header: {
    magic: string;
    record_count: number;
    field_count: number;
    record_size: number;
    string_block_size: number;
  } | null;
}

export interface DbcFilesPage {
  total: number;
  base_dir?: string;
  items: DbcFileInfo[];
}

export interface DbcSourceResource {
  id: number | null;
  type: string;
  name: string | null;
  model_folder: string | null;
}

export interface DbcAnnotation {
  record_id: number;
  resources: DbcSourceResource[];
}

export type DbcRecordRow = { _record_id: number; _index: number } & Record<
  string,
  unknown
>;

export interface DbcRecordsPage {
  total: number;
  page: number;
  page_size: number;
  items: DbcRecordRow[];
  fields: DbcFieldDef[];
  annotations: DbcAnnotation[];
}

export interface DbcRecordField {
  name: string;
  type: string;
  value: unknown;
}

export interface DbcRecordDetail {
  file: string;
  record_id: number;
  index: number;
  fields: DbcRecordField[];
  resources: DbcSourceResource[];
}

export interface MpqArchiveItem {
  name: string;
  batch: string;
  source: "mpq" | "dist";
  rel_path: string;
  abs_path?: string;
  size: number;
  mtime: string;
  obfuscation: string | null;
  file_count: number | null;
  has_manifest: boolean;
  has_changelog: boolean;
  published: boolean;
}

export interface MpqArchivesPage {
  total: number;
  items: MpqArchiveItem[];
}

export interface MpqFileEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number | null;
  kind?: string | null;
  file_count?: number;
}

export interface MpqFilesPage {
  archive: string;
  rel_path: string;
  source: string;
  obfuscation: string | null;
  total_files: number;
  prefix?: string;
  truncated?: boolean;
  entries: MpqFileEntry[];
  archive_info?: Record<string, string>;
}

export interface MpqFilePreview {
  kind: "text" | "blp" | "dbc" | "binary";
  path: string;
  size: number;
  cache_path: string | null;
  cache_abs_path?: string | null;
  content?: string;
  preview_url?: string;
  download_url?: string;
}

export interface MpqChangelog {
  archive: string;
  batch: string;
  content: string;
}

export interface AiConfig {
  configured: boolean;
  base_url: string;
  model: string;
  protocol: "openai" | "anthropic";
  api_key_masked: string | null;
  timeout_seconds: number;
  max_tokens: number;
  enabled: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
}

export interface AiConfigUpdateRequest {
  base_url: string;
  model: string;
  protocol: "openai" | "anthropic";
  api_key?: string;
  clear_api_key?: boolean;
  timeout_seconds: number;
  max_tokens: number;
  enabled: boolean;
}

export interface AiConfigTestResult {
  ok: boolean;
  error: string | null;
  tested_at: string;
}
