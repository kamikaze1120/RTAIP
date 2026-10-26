"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { normalizeEmail } from "./validate";
import { supabase } from "./supabase/client";

interface AuthValue {
  user: User | null;
  loading: boolean;
  dialogOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
  /** Sends a one time link and code to the address. Creates the profile on first use. */
  requestAccess: (email: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Completes sign in with the 6 digit code from the same email. */
  verifyCode: (email: string, code: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function friendly(message: string): string {
  if (/rate limit|too many|seconds/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  if (/expired|invalid/i.test(message)) return "That code is invalid or has expired. Request a new one.";
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const { data } = supabase().auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const requestAccess = useCallback<AuthValue["requestAccess"]>(async (raw) => {
    const email = normalizeEmail(raw);
    if (!email) return { ok: false, error: "Enter a valid email address." };
    const { error } = await supabase().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    return error ? { ok: false, error: friendly(error.message) } : { ok: true };
  }, []);

  const verifyCode = useCallback<AuthValue["verifyCode"]>(async (raw, code) => {
    const email = normalizeEmail(raw);
    const token = code.replace(/\s+/g, "");
    if (!email || !/^\d{6,8}$/.test(token)) return { ok: false, error: "Enter the code from the email." };
    const { error } = await supabase().auth.verifyOtp({ email, token, type: "email" });
    return error ? { ok: false, error: friendly(error.message) } : { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, loading, dialogOpen, openSignIn: () => setDialogOpen(true), closeSignIn: () => setDialogOpen(false), requestAccess, verifyCode, signOut }),
    [user, loading, dialogOpen, requestAccess, verifyCode, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
