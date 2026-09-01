import { useCallback, useEffect, useState } from "react";
import { ensureProfile } from "../sync/account.js";
import { syncConfigured } from "../sync/dataApi.js";

// The learner's server-side profile: role and approval status. Held separately
// from AuthContext because identity (who you are) and authorisation (what you
// may do here) come from different systems — Stack Auth and Postgres.
export function useProfile(status, getToken) {
  const [profile, setProfile] = useState(null);
  const [state, setState] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (status !== "signed-in" || !syncConfigured) {
      setProfile(null);
      setState("idle");
      return;
    }
    setState("loading");
    try {
      setProfile(await ensureProfile(getToken));
      setError(null);
      setState("ready");
    } catch (err) {
      setProfile(null);
      setError(err.message);
      setState("error");
    }
  }, [status, getToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profile, state, error, reload };
}
