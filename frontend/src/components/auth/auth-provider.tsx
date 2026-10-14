"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { getCurrentUser, logout as logoutRequest } from "@/lib/api/auth";
import type { CurrentUser } from "@/types/auth";

type AuthStatus = "loading" | "authenticated" | "anonymous" | "unavailable";

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  refresh: () => Promise<void>;
  setAuthenticated: (user: CurrentUser) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const current = await getCurrentUser();
      setUser(current);
      setStatus("authenticated");
    } catch (error) {
      setUser(null);
      setStatus(error instanceof ApiError && error.code === "UNAUTHENTICATED" ? "anonymous" : "unavailable");
    }
  }, []);

  useEffect(() => {
    let active = true;
    getCurrentUser().then(
      (current) => {
        if (!active) return;
        setUser(current);
        setStatus("authenticated");
      },
      (error: unknown) => {
        if (!active) return;
        setUser(null);
        setStatus(error instanceof ApiError && error.code === "UNAUTHENTICATED" ? "anonymous" : "unavailable");
      },
    );
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    refresh,
    setAuthenticated: (current) => { setUser(current); setStatus("authenticated"); },
    signOut: async () => {
      await logoutRequest();
      setUser(null);
      setStatus("anonymous");
    },
  }), [refresh, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
