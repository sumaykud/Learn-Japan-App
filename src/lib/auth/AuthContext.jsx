import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authConfigured, authErrorMessage, getStackApp } from "./stack.js";

const AuthContext = createContext(null);

// status:
//   "unconfigured" — no Stack env; accounts are switched off entirely
//   "loading"      — restoring a session from the cookie
//   "guest"        — no session; progress lives in localStorage only
//   "signed-in"    — session active; progress syncs to Neon
export function AuthProvider({ children }) {
  const [status, setStatus] = useState(authConfigured ? "loading" : "unconfigured");
  const [user, setUser] = useState(null);
  const stackUser = useRef(null);

  const adopt = useCallback((u) => {
    stackUser.current = u;
    if (!u) {
      setUser(null);
      setStatus("guest");
      return;
    }
    setUser({
      id: u.id,
      email: u.primaryEmail || "",
      displayName: u.displayName || u.primaryEmail || "Learner",
    });
    setStatus("signed-in");
  }, []);

  const refresh = useCallback(async () => {
    const app = await getStackApp();
    if (!app) {
      setStatus(authConfigured ? "guest" : "unconfigured");
      return;
    }
    try {
      adopt(await app.getUser());
    } catch {
      // A corrupt or expired cookie should drop us to guest, never to a
      // blank screen — the app is fully usable signed out.
      adopt(null);
    }
  }, [adopt]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (email, password) => {
      const app = await getStackApp();
      if (!app) return { ok: false, message: "Accounts are not configured for this build." };
      const res = await app.signInWithCredential({ email, password, noRedirect: true });
      if (res.status === "error") return { ok: false, message: authErrorMessage(res.error) };
      await refresh();
      return { ok: true };
    },
    [refresh]
  );

  const signUp = useCallback(
    async (email, password) => {
      const app = await getStackApp();
      if (!app) return { ok: false, message: "Accounts are not configured for this build." };
      const res = await app.signUpWithCredential({
        email,
        password,
        noRedirect: true,
        noVerificationCallback: true,
      });
      if (res.status === "error") return { ok: false, message: authErrorMessage(res.error) };
      await refresh();
      return { ok: true };
    },
    [refresh]
  );

  const signOut = useCallback(async () => {
    try {
      await stackUser.current?.signOut();
    } finally {
      adopt(null);
    }
  }, [adopt]);

  // Every Data API request needs a fresh bearer token. Stack refreshes it
  // behind getTokens(), so we ask per request rather than caching one.
  const getToken = useCallback(async () => {
    try {
      const tokens = await stackUser.current?.currentSession?.getTokens();
      return tokens?.accessToken || null;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, getToken, refresh, configured: authConfigured }),
    [status, user, signIn, signUp, signOut, getToken, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
