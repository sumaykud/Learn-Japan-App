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

// Superadmin only. target null wipes every account's progress; accounts survive.
export function adminResetProgress(getToken, targetUser = null) {
  return rpc(getToken, "admin_reset_progress", { target_user: targetUser });
}

// Superadmin only. Erases the account's study data and profile and records a
// tombstone so the next sign-in cannot recreate it. The Stack Auth login itself
// survives — see db/migrations/004_account_deletion.sql for why.
export function adminDeleteAccount(getToken, targetUser) {
  return rpc(getToken, "admin_delete_account", { target_user: targetUser });
}

// The one-time setup door (db/migrations/005_superadmin_setup.sql). True only
// while no superadmin exists; says nothing about whether a code was minted.
export function superadminSetupAvailable(getToken) {
  return rpc(getToken, "superadmin_setup_available");
}

// Turns the signed-in caller into the first superadmin if the code is right.
// The server takes the user from the JWT, never from anything sent here.
export function claimSuperadmin(getToken, setupCode) {
  return rpc(getToken, "claim_superadmin", { setup_code: setupCode });
}
