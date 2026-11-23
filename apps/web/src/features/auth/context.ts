import { createContext } from "react";
import type { AuthUser } from "@/shared/auth";

export interface AuthContextValue {
  user: AuthUser | null;
  bootstrapping: boolean;
  isAdmin: boolean;
  /** 是否拥有某查看权限（admin 恒 true；未登录恒 false） */
  hasPerm: (code: string) => boolean;
  signIn: (user: AuthUser, token: string) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
