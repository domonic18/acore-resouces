import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchMpqArchives,
  fetchMpqChangelog,
  fetchMpqDbcRecord,
  fetchMpqDbcRecords,
  fetchMpqFile,
  fetchMpqFiles,
  type MpqRecordQuery,
} from "@/shared/mpq";

export function useMpqArchives() {
  return useQuery({
    queryKey: ["mpq", "archives"],
    queryFn: fetchMpqArchives,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMpqFiles(
  archive: string | null,
  params: { prefix?: string; search?: string },
) {
  return useQuery({
    queryKey: ["mpq", "files", archive, params],
    queryFn: () => fetchMpqFiles(archive as string, params),
    enabled: !!archive,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useMpqFile(archive: string | null, path: string | null) {
  return useQuery({
    queryKey: ["mpq", "file", archive, path],
    queryFn: () => fetchMpqFile(archive as string, path as string),
    enabled: !!archive && !!path,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useMpqDbcRecords(
  archive: string | null,
  path: string | null,
  params: MpqRecordQuery,
) {
  return useQuery({
    queryKey: ["mpq", "dbc-records", archive, path, params],
    queryFn: () =>
      fetchMpqDbcRecords(archive as string, path as string, params),
    enabled: !!archive && !!path,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useMpqDbcRecord(
  archive: string | null,
  path: string | null,
  recordId: number | null,
) {
  return useQuery({
    queryKey: ["mpq", "dbc-record", archive, path, recordId],
    queryFn: () =>
      fetchMpqDbcRecord(archive as string, path as string, recordId as number),
    enabled: !!archive && !!path && recordId !== null,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useMpqChangelog(archive: string | null) {
  return useQuery({
    queryKey: ["mpq", "changelog", archive],
    queryFn: () => fetchMpqChangelog(archive as string),
    enabled: !!archive,
    retry: false,
    staleTime: 60 * 1000,
  });
}
