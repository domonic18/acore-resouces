import { useState, type FormEvent } from "react";
import { KeyRound, Plus, Search, ShieldCheck, Trash2, UserCog } from "lucide-react";
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useResetAccountPassword,
  useSetAccountPermissions,
  useSetAccountRole,
} from "@/features/accounts/hooks/useAccounts";
import { useAuth } from "@/features/auth/useAuth";
import { Badge, type BadgeTone } from "@/shared/components/ui/Badge";
import { Dialog } from "@/shared/components/ui/Dialog";
import { PERMISSION_DEFS, type LocalAccount } from "@/shared/auth";

const ROLE_BADGE: Record<string, BadgeTone> = {
  admin: "orange",
  viewer: "gray",
};

function formatTime(value: string | null): string {
  if (!value) return "从未登录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

/** 权限勾选组：viewer 行/建号表单共用 */
function PermissionCheckboxes({
  value,
  disabled,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${disabled ? "opacity-60" : ""}`}>
      {PERMISSION_DEFS.map((def) => (
        <label
          key={def.code}
          className="flex cursor-pointer items-center gap-1 text-xs text-text-secondary"
        >
          <input
            type="checkbox"
            className="accent-accent"
            checked={value.includes(def.code)}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, def.code]
                  : value.filter((code) => code !== def.code),
              )
            }
          />
          {def.label}
        </label>
      ))}
    </div>
  );
}

export function AccountsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error } = useAccounts(search);
  const setRole = useSetAccountRole();
  const setPermissions = useSetAccountPermissions();
  const createAccount = useCreateAccount();
  const resetPassword = useResetAccountPassword();
  const deleteAccount = useDeleteAccount();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "viewer",
    permissions: ["dist"] as string[],
  });
  const [formError, setFormError] = useState("");
  const [resetTarget, setResetTarget] = useState<LocalAccount | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetError, setResetError] = useState("");

  const isAdmin = user?.role === "admin";

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    createAccount.mutate(
      {
        username: form.username.trim(),
        password: form.password,
        role: form.role as "admin" | "viewer",
        permissions: form.role === "admin" ? [] : form.permissions,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setForm({ username: "", password: "", role: "viewer", permissions: ["dist"] });
        },
        onError: (err) =>
          setFormError(err instanceof Error ? err.message : "创建失败"),
      },
    );
  }

  function handleReset(event: FormEvent) {
    event.preventDefault();
    if (!resetTarget) return;
    setResetError("");
    resetPassword.mutate(
      { accountId: resetTarget.account_id, password: resetPasswordValue },
      {
        onSuccess: () => {
          setResetTarget(null);
          setResetPasswordValue("");
        },
        onError: (err) =>
          setResetError(err instanceof Error ? err.message : "重置失败"),
      },
    );
  }

  function handleDelete(account: LocalAccount) {
    if (!window.confirm(`确定删除账号「${account.username}」？该操作不可恢复。`)) return;
    deleteAccount.mutate(account.account_id);
  }

  const createForm = (
    <form onSubmit={handleCreate} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="form-label" htmlFor="account-username">用户名</label>
        <input
          id="account-username"
          className="form-input"
          value={form.username}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          placeholder="登录用户名（不区分大小写）"
          autoComplete="off"
          autoFocus
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="form-label" htmlFor="account-password">密码</label>
        <input
          id="account-password"
          className="form-input"
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          placeholder="至少 8 位"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="form-label" htmlFor="account-role">角色</label>
        <select
          id="account-role"
          className="form-input"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
        >
          <option value="viewer">普通账号（仅查看）</option>
          <option value="admin">管理员（可导出/发布/管理账号）</option>
        </select>
      </div>
      {form.role === "viewer" ? (
        <div className="flex flex-col gap-1.5">
          <span className="form-label">查看权限</span>
          <PermissionCheckboxes
            value={form.permissions}
            onChange={(permissions) => setForm((f) => ({ ...f, permissions }))}
          />
          <span className="text-[11px] text-text-tertiary">
            管理员隐式拥有全部权限；普通账号勾选后才可见对应页面
          </span>
        </div>
      ) : null}
      {formError ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {formError}
        </div>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary justify-center"
        disabled={createAccount.isPending || !form.username.trim() || !form.password}
      >
        {createAccount.isPending ? "创建中…" : "创建账号"}
      </button>
    </form>
  );

  const resetForm = (
    <form onSubmit={handleReset} className="flex flex-col gap-4">
      <p className="text-xs text-text-tertiary">
        为账号「{resetTarget?.username}」设置新密码，无需旧密码。
      </p>
      <div className="flex flex-col gap-1.5">
        <label className="form-label" htmlFor="reset-password">新密码</label>
        <input
          id="reset-password"
          className="form-input"
          type="password"
          value={resetPasswordValue}
          onChange={(e) => setResetPasswordValue(e.target.value)}
          placeholder="至少 8 位"
          autoComplete="new-password"
          autoFocus
          required
        />
      </div>
      {resetError ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {resetError}
        </div>
      ) : null}
      <button
        type="submit"
        className="btn btn-primary justify-center"
        disabled={resetPassword.isPending || !resetPasswordValue}
      >
        {resetPassword.isPending ? "重置中…" : "重置密码"}
      </button>
    </form>
  );

  return (
    <div className="content">
      <header className="topbar">
        <h1 className="page-title">账号权限</h1>
        <div className="topbar-actions">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              className="form-input w-56 pl-8 text-xs"
              placeholder="搜索账号…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> 新建账号
          </button>
        </div>
      </header>

      {!isAdmin ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          仅管理员可管理账号。当前角色：{user?.role === "admin" ? "管理员" : "普通账号"}
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title flex items-center gap-2">
                <UserCog className="h-4 w-4" /> 系统账号
              </div>
              <div className="card-subtitle">
                本系统独立账号（SQLite 存储）；分发站经委托验证共用同一套账号
              </div>
            </div>
          </div>
          <div className="card-body p-0">
            {isLoading ? (
              <div className="py-12 text-center text-sm text-text-tertiary">加载中...</div>
            ) : isError ? (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error instanceof Error ? error.message : "账号列表加载失败"}
              </div>
            ) : !data || data.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-tertiary">
                未找到匹配的账号
              </div>
            ) : (
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>账号</th>
                    <th className="w-28">角色</th>
                    <th>查看权限</th>
                    <th className="w-44">创建时间</th>
                    <th className="w-44">最后登录</th>
                    <th className="w-56">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((account) => {
                    const isSelf = account.account_id === user?.account_id;
                    return (
                      <tr key={account.account_id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{account.username}</span>
                            {isSelf ? <Badge tone="cyan">当前登录</Badge> : null}
                          </div>
                        </td>
                        <td>
                          {isSelf ? (
                            <Badge tone={ROLE_BADGE[account.role] ?? "gray"}>
                              {account.role === "admin" ? "管理员" : "普通账号"}
                            </Badge>
                          ) : (
                            <select
                              className="form-input py-1 text-xs"
                              value={account.role}
                              disabled={setRole.isPending}
                              onChange={(e) =>
                                setRole.mutate({
                                  accountId: account.account_id,
                                  role: e.target.value as "admin" | "viewer",
                                })
                              }
                            >
                              <option value="admin">管理员</option>
                              <option value="viewer">普通账号</option>
                            </select>
                          )}
                        </td>
                        <td>
                          {account.role === "admin" ? (
                            <span className="text-xs text-text-tertiary">全部（管理员）</span>
                          ) : (
                            <PermissionCheckboxes
                              value={account.permissions}
                              disabled={isSelf || setPermissions.isPending}
                              onChange={(permissions) =>
                                setPermissions.mutate({
                                  accountId: account.account_id,
                                  permissions,
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="text-text-tertiary">{formatTime(account.created_at)}</td>
                        <td className="text-text-tertiary">{formatTime(account.last_login_at)}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="重置密码"
                              onClick={() => {
                                setResetTarget(account);
                                setResetPasswordValue("");
                                setResetError("");
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5" /> 重置密码
                            </button>
                            {isSelf ? (
                              <span className="text-xs text-text-tertiary">不可删除</span>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm text-danger"
                                title="删除账号"
                                disabled={deleteAccount.isPending}
                                onClick={() => handleDelete(account)}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> 删除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-text-tertiary">
        <ShieldCheck className="h-3.5 w-3.5" />
        管理员可执行导出、发布与权限设置；普通账号仅拥有勾选的查看权限（下载补丁 /
        坐骑 / 宠物 / NPC），所有编辑与写操作仅限管理员。权限变更在账号重新登录后生效。
        首次部署的 admin 账号请在侧边栏「修改密码」中更新初始密码。
      </p>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建账号"
        subtitle="账号将同时用于资源系统与补丁分发站登录"
        size="sm"
      >
        {createForm}
      </Dialog>
      <Dialog
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title="重置密码"
        size="sm"
      >
        {resetForm}
      </Dialog>
    </div>
  );
}
