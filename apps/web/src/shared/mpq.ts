import { apiGetJson } from "@/shared/api";
import type {
  DbcRecordDetail,
  DbcRecordsPage,
  MpqArchivesPage,
  MpqFilePreview,
  MpqFilesPage,
} from "@/shared/types";

export interface MpqRecordQuery {
  page?: number;
  page_size?: number;
  field?: string;
  op?: string;
  value?: string;
}

export function fetchMpqArchives(): Promise<MpqArchivesPage> {
  return apiGetJson<MpqArchivesPage>("/api/mpq/archives");
}

export function fetchMpqFiles(
  archive: string,
  params: { prefix?: string; search?: string } = {},
): Promise<MpqFilesPage> {
  const query = new URLSearchParams();
  if (params.prefix) query.set("prefix", params.prefix);
  if (params.search) query.set("search", params.search);
  return apiGetJson<MpqFilesPage>(
    `/api/mpq/files?archive=${encodeURIComponent(archive)}&${query.toString()}`,
  );
}

export function fetchMpqFile(archive: string, path: string): Promise<MpqFilePreview> {
  const query = new URLSearchParams({ archive, path });
  return apiGetJson<MpqFilePreview>(`/api/mpq/file?${query.toString()}`);
}

export function fetchMpqDbcRecords(
  archive: string,
  path: string,
  params: MpqRecordQuery,
): Promise<DbcRecordsPage> {
  const query = new URLSearchParams();
  query.set("archive", archive);
  query.set("path", path);
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.page_size ?? 20));
  if (params.field) {
    query.set("field", params.field);
    query.set("op", params.op ?? "eq");
    query.set("value", params.value ?? "");
  }
  return apiGetJson<DbcRecordsPage>(`/api/mpq/file/records?${query.toString()}`);
}

export function fetchMpqDbcRecord(
  archive: string,
  path: string,
  recordId: number,
): Promise<DbcRecordDetail> {
  const query = new URLSearchParams({
    archive,
    path,
    record_id: String(recordId),
  });
  return apiGetJson<DbcRecordDetail>(`/api/mpq/file/record?${query.toString()}`);
}
