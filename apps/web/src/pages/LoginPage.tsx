import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "@/features/auth/useAuth";
import { login } from "@/shared/auth";

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(username.trim(), password);
      signIn(
        {
          account_id: result.account_id,
          username: result.username,
          role: result.role,
          permissions: result.permissions,
        },
        result.token,
      );
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-semibold">资源管理系统</h1>
          <p className="text-sm text-muted-foreground">
            使用系统账号登录（与补丁分发站共用）
          </p>
        </div>
        <form onSubmit={handleSubmit} className="card p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="form-label" htmlFor="login-username">
                账号
              </label>
              <input
                id="login-username"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="系统账号用户名"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="form-label" htmlFor="login-password">
                密码
              </label>
              <input
                id="login-password"
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="系统账号密码"
                autoComplete="current-password"
                required
              />
            </div>
            {error ? (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              className="btn btn-primary w-full justify-center"
              disabled={submitting || !username.trim() || !password}
            >
              <LogIn className="h-4 w-4" />
              {submitting ? "登录中…" : "登录"}
            </button>
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          普通账号可查看资源；管理员可执行导出、发布与权限设置
        </p>
      </div>
    </div>
  );
}
