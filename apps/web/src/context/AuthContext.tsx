import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { loadStoredToken, setToken as persistToken } from "../api/client";

interface DecodedToken {
  sub: string;
  isPlatformAdmin: boolean;
  scope: "full" | "mfa_setup";
}

function decodeToken(token: string): DecodedToken | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

interface AuthContextValue {
  token: string | null;
  decoded: DecodedToken | null;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => loadStoredToken());

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      decoded: token ? decodeToken(token) : null,
      login: (t: string) => {
        persistToken(t);
        setTokenState(t);
      },
      logout: () => {
        persistToken(null);
        setTokenState(null);
      },
    }),
    [token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
