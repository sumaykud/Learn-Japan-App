import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban, Check, LogOut, RefreshCw, RotateCcw, Search, ShieldCheck, ShieldPlus, Trash2, TriangleAlert, Undo2,
  UserX, Users,
} from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext.jsx";
import {
  adminDeleteAccount, adminListAccounts, adminResetProgress, adminSetRole, adminSetStatus, adminStats,
} from "../lib/sync/account.js";
import {
  ROLE, ROLE_LABEL, assignableRoles, canDeleteAccounts, canResetProgress, isSuperadmin,
} from "../lib/auth/roles.js";
import { Stat } from "../components/ui.jsx";

const STATUS_TONE = {
  pending: { bg: "var(--vermillion-soft)", fg: "var(--amber)", label: "Pending" },
  approved: { bg: "var(--green-soft)", fg: "var(--green)", label: "Approved" },
  suspended: { bg: "var(--line-soft)", fg: "var(--muted)", label: "Suspended" },
};

function RoleBadge({ role }) {
  if (role === ROLE.superadmin) {
    return (
      <>
        <ShieldPlus size={11} style={{ verticalAlign: -1, color: "var(--vermillion)" }} />{" "}
        {ROLE_LABEL.superadmin}
      </>
    );
  }
  if (role === ROLE.admin) {
    return (
      <>
        <ShieldCheck size={11} style={{ verticalAlign: -1 }} /> {ROLE_LABEL.admin}
      </>
    );
  }
  return <>{ROLE_LABEL[role] || role}</>;
}

function when(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// The admin console is deliberately not part of the learner shell: an admin
// account has no study data and no reason to see the tabs. This is the entire
// surface for that role.
//
// `profile` is the viewer's own row. It decides which controls are offered —
// an ordinary admin is not shown the superadmin actions the server would
// refuse anyway. Hiding them is courtesy; admin_set_role() is the guard.
export default function AdminConsole({ profile }) {
  const { user, getToken, signOut } = useAuth();
  const viewerRole = profile?.role;
  const viewerIsSuper = isSuperadmin(viewerRole);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [q, setQ] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [accounts, s] = await Promise.all([adminListAccounts(getToken), adminStats(getToken)]);
      setRows(accounts || []);
      setStats(s);
      setError(null);
      setState("ready");
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id, fn, message) => {
    setBusyId(id);
    setNotice(null);
    try {
      await fn();
      await load();
      if (message) setNotice(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => (r.email || "").toLowerCase().includes(needle) || r.status.includes(needle));
  }, [rows, q]);

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="admin">
      <header className="admin-bar">
        <div className="admin-bar-inner">
          <div>
            <h1>
              Admin<span className="en">Account administration · no learning data</span>
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="sub">{user?.email}</span>
            <button className="btn" onClick={load} title="Reload">
              <RefreshCw size={14} />
            </button>
            <button className="btn" onClick={signOut}>
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {error && (
          <p className="form-error">
            <TriangleAlert size={14} /> {error}
          </p>
        )}
        {notice && (
          <div className="banner" style={{ borderColor: "var(--green)" }}>
            <Check size={16} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>{notice}</div>
            <button className="icon-btn" onClick={() => setNotice(null)}>
              <Undo2 size={15} />
            </button>
          </div>
        )}

        <div className="grid grid-3" style={{ marginBottom: 26 }}>
          <Stat n={stats?.total ?? "—"} label="Accounts" />
          <Stat n={stats?.pending ?? "—"} label="Awaiting approval" tone={pending ? "var(--vermillion)" : undefined} />
          <Stat n={stats?.approved ?? "—"} label="Approved" tone="var(--green)" />
          <Stat n={stats?.admins ?? "—"} label="Administrators" />
          <Stat n={stats?.superadmins ?? "—"} label="Superadmins" tone="var(--vermillion)" />
          <Stat n={stats?.cards ?? "—"} label="Cards in review" />
        </div>

        <div className="section-head">
          <div>
            <h2>Accounts</h2>
            <p className="sub">Pending accounts are listed first. Approving one lets that learner start studying.</p>
          </div>
          <label className="chip" style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px" }}>
            <Search size={13} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by email"
              style={{
                border: "none", background: "transparent", outline: "none", font: "inherit",
                fontSize: 12.5, color: "var(--ink)", width: 150,
              }}
            />
          </label>
        </div>

        {state === "loading" ? (
          <p className="sub">Loading accounts…</p>
        ) : filtered.length === 0 ? (
          <div className="card">
            <p className="sub" style={{ margin: 0 }}>
              {rows.length === 0 ? "No accounts have been created yet." : "No account matches that filter."}
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Status</th>
                  <th className="num">Cards</th>
                  <th className="num">Reviews</th>
                  <th>Joined</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const tone = STATUS_TONE[r.status] || STATUS_TONE.pending;
                  const self = r.user_id === user?.id;
                  const busy = busyId === r.user_id;
                  // A superadmin row is untouchable for an ordinary admin —
                  // role, status and progress alike. admin_set_role(),
                  // admin_set_status() and admin_reset_progress() each raise
                  // for this case; the row goes read-only so nobody clicks a
                  // button whose only outcome is an error banner.
                  const locked = !viewerIsSuper && r.role === ROLE.superadmin;
                  return (
                    <tr key={r.user_id}>
                      <td>
                        <div className="acct">
                          <span className="avatar">{(r.email || "?").slice(0, 1).toUpperCase()}</span>
                          <span>
                            <span className="acct-email">{r.email || r.user_id}</span>
                            <span className="acct-role">
                              <RoleBadge role={r.role} />
                              {self && " · you"}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="pill" style={{ background: tone.bg, color: tone.fg }}>
                          {tone.label}
                        </span>
                      </td>
                      <td className="num">{r.cards}</td>
                      <td className="num">{r.reviews}</td>
                      <td className="sub">{when(r.created_at)}</td>
                      <td className="right">
                        {self ? (
                          // The server refuses these for your own row anyway;
                          // hiding them keeps the reason obvious.
                          <span className="sub">—</span>
                        ) : locked ? (
                          <span className="sub" title="Only a superadmin can change a superadmin account">
                            Locked
                          </span>
                        ) : (
                          <div className="row-actions">
                            {r.status !== "approved" && (
                              <button
                                className="btn tiny-btn"
                                disabled={busy}
                                onClick={() => act(r.user_id, () => adminSetStatus(getToken, r.user_id, "approved"), `Approved ${r.email}.`)}
                              >
                                <Check size={13} /> Approve
                              </button>
                            )}
                            {r.status === "approved" && (
                              <button
                                className="btn tiny-btn"
                                disabled={busy}
                                onClick={() => act(r.user_id, () => adminSetStatus(getToken, r.user_id, "suspended"), `Suspended ${r.email}.`)}
                              >
                                <Ban size={13} /> Suspend
                              </button>
                            )}
                            {(() => {
                              // Three roles make a toggle meaningless, so the
                              // row offers exactly the moves this viewer is
                              // allowed to make. An ordinary admin looking at
                              // a superadmin gets an empty list and a reason.
                              const options = assignableRoles(viewerRole, r.role);
                              if (options.length === 0) {
                                return (
                                  <span className="sub" title="Only a superadmin can change a superadmin account">
                                    locked
                                  </span>
                                );
                              }
                              return (
                                <select
                                  className="role-select"
                                  value={r.role}
                                  disabled={busy}
                                  title="Change role"
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    if (next === r.role) return;
                                    if (
                                      next === ROLE.superadmin &&
                                      !window.confirm(
                                        `Make ${r.email} a superadmin? They will be able to appoint other superadmins and reset every account's progress.`
                                      )
                                    )
                                      return;
                                    act(
                                      r.user_id,
                                      () => adminSetRole(getToken, r.user_id, next),
                                      `${r.email} is now ${ROLE_LABEL[next].toLowerCase()}.`
                                    );
                                  }}
                                >
                                  {options.map((role) => (
                                    <option key={role} value={role}>
                                      {ROLE_LABEL[role]}
                                    </option>
                                  ))}
                                </select>
                              );
                            })()}
                            {canResetProgress(viewerRole) && (
                              <button
                                className="btn tiny-btn"
                                disabled={busy}
                                title="Reset this learner's progress"
                                onClick={() => {
                                  if (window.confirm(`Reset all study progress for ${r.email}? The account stays.`))
                                    act(r.user_id, () => adminResetProgress(getToken, r.user_id), `Progress reset for ${r.email}.`);
                                }}
                              >
                                <RotateCcw size={13} />
                              </button>
                            )}
                            {canDeleteAccounts(viewerRole) && (
                              <button
                                className="btn tiny-btn danger-btn"
                                disabled={busy}
                                title="Delete this account"
                                onClick={() => {
                                  // Irreversible, so a click-through confirm is
                                  // not enough: typing the address proves the
                                  // right row was meant, not merely the button.
                                  const expected = r.email || r.user_id;
                                  const typed = window.prompt(
                                    `Permanently delete ${expected}?\n\n` +
                                      "Their study history is erased and they can no longer use this app. " +
                                      "This cannot be undone.\n\n" +
                                      "Type the email address to confirm:"
                                  );
                                  if (typed === null) return;
                                  if (typed.trim().toLowerCase() !== expected.toLowerCase()) {
                                    setError("The address did not match, so nothing was deleted.");
                                    return;
                                  }
                                  act(r.user_id, () => adminDeleteAccount(getToken, r.user_id), `Deleted ${expected}.`);
                                }}
                              >
                                <UserX size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Reserved for the top tier. admin_reset_progress(null) raises for an
            ordinary admin, so showing the button would only produce an error. */}
        {canResetProgress(viewerRole) && (
        <div style={{ marginTop: 34 }}>
          <div className="section-head">
            <div>
              <h2 style={{ color: "var(--vermillion)" }}>Danger zone</h2>
              <p className="sub">
                Erases every learner's cards and review history across all accounts. The accounts themselves are kept.
              </p>
            </div>
          </div>
          {confirmWipe ? (
            <div className="card" style={{ borderColor: "var(--vermillion)" }}>
              <p style={{ marginTop: 0 }}>
                <strong>This cannot be undone.</strong> {stats?.cards ?? 0} card records across {stats?.total ?? 0}{" "}
                accounts will be deleted.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  style={{ borderColor: "var(--vermillion)", color: "var(--vermillion)" }}
                  onClick={() =>
                    act(null, () => adminResetProgress(getToken, null), "All learning progress has been reset.").then(() =>
                      setConfirmWipe(false)
                    )
                  }
                >
                  <Trash2 size={14} /> Yes, reset everyone's progress
                </button>
                <button className="btn" onClick={() => setConfirmWipe(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn" onClick={() => setConfirmWipe(true)}>
              <Users size={14} /> Reset all learning progress
            </button>
          )}
        </div>
        )}
      </main>
    </div>
  );
}
