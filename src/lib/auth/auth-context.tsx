"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { DEMO_USERS } from "@/lib/data/dummy";
import type { User, UserRole } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (role: UserRole) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = "litcoach-demo-user";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("litcoach-auth", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("litcoach-auth", onStoreChange);
  };
}

function getSnapshot(): UserRole | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const role = JSON.parse(raw) as UserRole;
    return role === "teacher" || role === "student" ? role : null;
  } catch {
    return null;
  }
}

function getServerSnapshot(): UserRole | null {
  return null;
}

function emitAuthChange() {
  window.dispatchEvent(new Event("litcoach-auth"));
}

/** false on server / SSR, true after client hydration */
function useHasHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrated = useHasHydrated();
  const role = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const user: User | null = hydrated && role ? DEMO_USERS[role] : null;
  const isLoading = !hydrated;

  const login = useCallback((nextRole: UserRole) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRole));
    emitAuthChange();
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    emitAuthChange();
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, logout }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
