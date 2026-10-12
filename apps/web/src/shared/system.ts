import { apiGetJson } from "@/shared/api";
import type { SystemInfo } from "@/shared/types";

export function getSystemInfo(): Promise<SystemInfo> {
  return apiGetJson<SystemInfo>("/api/system/info");
}
