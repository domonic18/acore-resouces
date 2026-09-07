import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchDbcFiles,
  fetchDbcRecord,
  fetchDbcRecords,
  type DbcRecordQuery,
} from "@/shared/dbc";

export function useDbcFiles() {
  return useQuery({
    queryKey: ["dbc", "files"],
    queryFn: fetchDbcFiles,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDbcRecords(file: string | null, params: DbcRecordQuery) {
  return useQuery({
    queryKey: ["dbc", "records", file, params],
    queryFn: () => fetchDbcRecords(file as string, params),
    enabled: !!file,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useDbcRecord(file: string | null, recordId: number | null) {
  return useQuery({
    queryKey: ["dbc", "record", file, recordId],
    queryFn: () => fetchDbcRecord(file as string, recordId as number),
    enabled: !!file && recordId !== null,
    retry: false,
    staleTime: 60 * 1000,
  });
}
