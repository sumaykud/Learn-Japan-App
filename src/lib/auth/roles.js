// The three roles, and the questions the UI actually asks about them.
//
// These mirror db/migrations/003_superadmin.sql and decide nothing on their
// own. The database re-checks every one of them in a SECURITY DEFINER function
// before it acts, so a client that lies here gets an exception, not access.
// What this file buys is a UI that does not offer buttons the server will
// refuse — and one place to change when a role is added.

export const ROLE = {
  user: "user",
  admin: "admin",
  superadmin: "superadmin",
};

// May reach /admin at all. Both tiers may; this is is_admin() in SQL.
export const canAdminister = (role) => role === ROLE.admin || role === ROLE.superadmin;

// May appoint or remove superadmins.
export const isSuperadmin = (role) => role === ROLE.superadmin;

// The destructive operations. Both belong to the top tier since migration 004,
// so an ordinary admin can moderate accounts but never erase anything. Named
// separately from isSuperadmin so the console reads as "can this viewer delete"
// and a future split of the tier changes one line here.
export const canDeleteAccounts = isSuperadmin;
export const canResetProgress = isSuperadmin;

// Belongs in the learner shell at /. A learner is anyone who is not staff.
export const isLearner = (role) => !canAdminister(role);

// What a viewer of `viewerRole` may set `targetRole` to, mirroring the guards
// in admin_set_role(). Empty means the row is read-only for this viewer.
export function assignableRoles(viewerRole, targetRole) {
  if (!canAdminister(viewerRole)) return [];
  if (isSuperadmin(viewerRole)) return [ROLE.user, ROLE.admin, ROLE.superadmin];
  // An ordinary admin cannot touch a superadmin, in either direction.
  if (isSuperadmin(targetRole)) return [];
  return [ROLE.user, ROLE.admin];
}

export const ROLE_LABEL = {
  user: "Learner",
  admin: "Administrator",
  superadmin: "Superadmin",
};
