import { apiFetch, apiGetJson } from "@/shared/api";
import type {
  AiConfig,
  AiConfigTestResult,
  AiConfigUpdateRequest,
} from "@/shared/types";

export function getAiConfig(): Promise<AiConfig> {
  return apiGetJson<AiConfig>("/api/settings/ai-config");
}

export function updateAiConfig(
  body: AiConfigUpdateRequest,
): Promise<AiConfig> {
  return apiFetch("/api/settings/ai-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((res) => res.json() as Promise<AiConfig>);
}

export function testAiConfig(): Promise<AiConfigTestResult> {
  return apiFetch("/api/settings/ai-config/test", {
    method: "POST",
  }).then((res) => res.json() as Promise<AiConfigTestResult>);
}
