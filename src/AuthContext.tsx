import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "./api";
import type { AuthUser } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;    // 首次启动时验证 token
  loggedIn: boolean;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<(AuthState & AuthActions) | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, loggedIn: false });

  // 首次启动：如果有 token，验证一下
  useEffect(() => {
    const t = api.getToken();
    if (!t) { setState({ user: null, loading: false, loggedIn: false }); return; }
    api.me()
      .then(r => setState({ user: r.user, loading: false, loggedIn: true }))
      .catch(() => { api.setToken(null); setState({ user: null, loading: false, loggedIn: false }); });
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    api.setToken(r.token);
    setState({ user: r.user, loading: false, loggedIn: true });
  };
  const register = async (email: string, password: string, nickname?: string) => {
    const r = await api.register(email, password, nickname);
    api.setToken(r.token);
    setState({ user: r.user, loading: false, loggedIn: true });
  };
  const logout = () => {
    api.logout();
    setState({ user: null, loading: false, loggedIn: false });
  };
  const refresh = async () => {
    if (!api.getToken()) return;
    try {
      const r = await api.me();
      setState(s => ({ ...s, user: r.user, loggedIn: true }));
    } catch { logout(); }
  };

  return <AuthContext.Provider value={{ ...state, login, register, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
