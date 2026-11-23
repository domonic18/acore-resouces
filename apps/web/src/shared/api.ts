export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "http://localhost:8000" : "");

export async function apiFetch(path: string, init?: RequestInit) {
  const url =
    path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(extractErrorMessage(text, response.status));
  }

  return response;
}

/** 从错误响应里取出可读文案：FastAPI 的 detail 优先，否则回退到原文。 */
function extractErrorMessage(text: string, status: number): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === "object" &&
      "detail" in parsed &&
      typeof (parsed as { detail: unknown }).detail === "string"
    ) {
      const detail = (parsed as { detail: string }).detail;
      if (detail.trim()) return detail;
    }
  } catch {
    // 非 JSON 响应（如 HTML 错误页），按原文处理
  }
  return text.trim() || `HTTP ${status}`;
}

export async function apiGetJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  return response.json() as Promise<T>;
}
