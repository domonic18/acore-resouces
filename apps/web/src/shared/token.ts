/** JWT 令牌的本地存取（独立小模块，避免与 api.ts 相互依赖成环）。 */

const TOKEN_KEY = "acore_auth_token";

export function getAccessToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
