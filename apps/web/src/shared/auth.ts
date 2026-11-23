import { apiFetch, apiGetJson } from "@/shared/api";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/shared/token";

export interface AuthUser {
  account_id: number;
  username: string;
  role: "admin" | "viewer";
  /** viewer 的查看权限（dist/mount/pet/npc）；admin 隐式全量，字段可能为空数组 */
  permissions: string[];
}

export interface LoginResponse extends AuthUser {
  token: string;
}

/** 可配置的查看权限（与后端 PERMISSION_CODES 对应，前端单一真相） */
export const PERMISSION_DEFS: { code: string; label: string }[] = [
  { code: "dist", label: "下载补丁" },
  { code: "mount", label: "坐骑查看" },
  { code: "pet", label: "宠物查看" },
  { code: "npc", label: "NPC查看" },
];

export interface LocalAccount {
  account_id: number;
  username: string;
  role: "admin" | "viewer";
  permissions: string[];
  created_at: string;
  last_login_at: string | null;
}

export interface AccountCreateInput {
  username: string;
  password: string;
  role: "admin" | "viewer";
  permissions: string[];
}

export { clearAccessToken, getAccessToken, setAccessToken };

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return (await response.json()) as LoginResponse;
}

export async function fetchMe(): Promise<AuthUser> {
  return apiGetJson<AuthUser>("/api/auth/me");
}

export async function listAccounts(search = "", limit = 50): Promise<LocalAccount[]> {
  const params = new URLSearchParams({ search, limit: String(limit) });
  return apiGetJson<LocalAccount[]>(`/api/auth/accounts?${params}`);
}

export async function createAccount(input: AccountCreateInput): Promise<LocalAccount> {
  const response = await apiFetch("/api/auth/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await response.json()) as LocalAccount;
}

export async function setAccountRole(
  accountId: number,
  role: "admin" | "viewer",
): Promise<LocalAccount> {
  const response = await apiFetch(`/api/auth/accounts/${accountId}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return (await response.json()) as LocalAccount;
}

export async function setAccountPermissions(
  accountId: number,
  permissions: string[],
): Promise<LocalAccount> {
  const response = await apiFetch(`/api/auth/accounts/${accountId}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });
  return (await response.json()) as LocalAccount;
}

export async function resetAccountPassword(
  accountId: number,
  password: string,
): Promise<LocalAccount> {
  const response = await apiFetch(`/api/auth/accounts/${accountId}/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return (await response.json()) as LocalAccount;
}

export async function deleteAccount(accountId: number): Promise<void> {
  await apiFetch(`/api/auth/accounts/${accountId}`, { method: "DELETE" });
}

export async function changeMyPassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await apiFetch("/api/auth/me/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}
