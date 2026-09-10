import { apiGetJson } from "@/shared/api";
import type {
  DbcFilesPage,
  DbcRecordDetail,
  DbcRecordsPage,
} from "@/shared/types";

export interface DbcRecordQuery {
  page?: number;
  page_size?: number;
  field?: string;
  op?: string;
  value?: string;
}

export function fetchDbcFiles(): Promise<DbcFilesPage> {
  return apiGetJson<DbcFilesPage>("/api/dbc/files");
}

export function fetchDbcRecords(
  file: string,
  params: DbcRecordQuery,
): Promise<DbcRecordsPage> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.page_size ?? 20));
  if (params.field) {
    query.set("field", params.field);
    query.set("op", params.op ?? "eq");
    query.set("value", params.value ?? "");
  }
  return apiGetJson<DbcRecordsPage>(
    `/api/dbc/${encodeURIComponent(file)}/records?${query.toString()}`,
  );
}

export function fetchDbcRecord(
  file: string,
  recordId: number,
): Promise<DbcRecordDetail> {
  return apiGetJson<DbcRecordDetail>(
    `/api/dbc/${encodeURIComponent(file)}/records/${recordId}`,
  );
}

export interface NextFreeIdResult {
  file: string;
  start: number;
  next_free_id: number;
}

export function fetchNextFreeId(
  file: string,
  start = 90000,
): Promise<NextFreeIdResult> {
  return apiGetJson<NextFreeIdResult>(
    `/api/dbc/${encodeURIComponent(file)}/next-free-id?start=${start}`,
  );
}
