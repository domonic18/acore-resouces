import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { fetchMe, type AuthUser } from "@/shared/auth";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/shared/token";
import { AuthContext } from "@/features/auth/context";
import { useAuth } from "@/features/auth/useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setBootstrapping(false);
      return;
    }
    // 有本地令牌时向后端确认有效性（过期/被改 → apiFetch 会清令牌并跳登录）
    fetchMe()
      .then(setUser)
      .catch(() => clearAccessToken())
      .finally(() => setBootstrapping(false));
  }, []);

  const signIn = useCallback((nextUser: AuthUser, token: string) => {
    setAccessToken(token);
    setUser(nextUser);
  }, []);

  const signOut = useCallback(() => {
    clearAccessToken();
    setUser(null);
  }, []);

  const hasPerm = useCallback(
    (code: string) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      return (user.permissions ?? []).includes(code);
    },
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      bootstrapping,
      isAdmin: user?.role === "admin",
      hasPerm,
      signIn,
      signOut,
    }),
    [user, bootstrapping, hasPerm, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** 路由守卫：未登录跳登录页，引导中显示占位避免闪烁。 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, bootstrapping } = useAuth();
  const location = useLocation();
  if (bootstrapping) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted">
        正在检查登录状态…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
