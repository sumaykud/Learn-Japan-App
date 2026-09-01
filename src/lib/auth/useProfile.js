import { useCallback, useEffect, useState } from "react";
import { ensureProfile } from "../sync/account.js";
import { syncConfigured } from "../sync/dataApi.js";

// Backoff between profile fetches, in ms. Short and few: this covers a cookie
// write finishing, not an outage.
const RETRIES = [350, 900, 1800];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The learner's server-side profile: role and approval status. Held separately
// from AuthContext because identity (who you are) and authorisation (what you
// may do here) come from different systems — Stack Auth and Postgres.
export function useProfile(status, getToken) {
  const [profile, setProfile] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (status !== "signed-in") {
      setProfile(null);
      setState("idle");
      return;
    }

    // Half-configured deployment: Stack Auth is set but the Data API is not,
    // so sign-in works and then there is nowhere to read the profile from.
    // Without this branch the app sits on "Loading your account…" forever,
    // which hides the actual cause. Say what is missing instead.
    if (!syncConfigured) {
      setProfile(null);
      setError(
        "VITE_NEON_DATA_API_URL is not set for this build. Accounts need all three VITE_ values — see .env.example."
      );
      setState("error");
      return;
    }
    setState("loading");

    // Signing in is a handshake across two services: Stack Auth writes the
    // session cookie, and only then does a token carrying `sub` exist for
    // Postgres to read. Asking for the profile the instant status flips can
    // land in that gap, and the database answers "not authenticated" — which
    // is transient, not a permission failure. Retry briefly before believing
    // it, so nobody is shown an error screen for a race they cannot act on.
    let lastError = null;
    for (let attempt = 0; attempt < RETRIES.length + 1; attempt++) {
      try {
        const result = await ensureProfile(getToken);
        setProfile(result);
        setError(null);
        setState("ready");
        return;
      } catch (err) {
        lastError = err;
        if (attempt < RETRIES.length) await sleep(RETRIES[attempt]);
      }
    }

    setProfile(null);
    setError(lastError?.message || "Unknown error");
    setState("error");
  }, [status, getToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profile, state, error, reload };
}
