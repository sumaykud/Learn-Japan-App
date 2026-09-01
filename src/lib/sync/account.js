import { rpc } from "./dataApi.js";

// Creates the profile on first sign-in and returns the caller's own row.
// The server decides role and status — nothing the client sends can influence
// them, which is the whole point of routing this through a function.
export async function ensureProfile(getToken) {
  const rows = await rpc(getToken, "ensure_profile");
  return rows && rows.length ? rows[0] : null;
}

export function adminListAccounts(getToken) {
  return rpc(getToken, "admin_list_accounts");
}

export function adminStats(getToken) {
  return rpc(getToken, "admin_stats").then((r) => (r && r.length ? r[0] : null));
}

export function adminSetStatus(getToken, targetUser, newStatus) {
  return rpc(getToken, "admin_set_status", { target_user: targetUser, new_status: newStatus });
}

export function adminSetRole(getToken, targetUser, newRole) {
  return rpc(getToken, "admin_set_role", { target_user: targetUser, new_role: newRole });
}

// target null wipes every account's progress. Accounts themselves survive.
export function adminResetProgress(getToken, targetUser = null) {
  return rpc(getToken, "admin_reset_progress", { target_user: targetUser });
}
