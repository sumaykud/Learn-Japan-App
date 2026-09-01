import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban, Check, LogOut, RefreshCw, Search, ShieldCheck, ShieldOff, Trash2, TriangleAlert, Undo2, Users,
} from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext.jsx";
import {
  adminListAccounts, adminResetProgress, adminSetRole, adminSetStatus, adminStats,
} from "../lib/sync/account.js";
import { Stat } from "../components/ui.jsx";

const STATUS_TONE = {
  pending: { bg: "var(--vermillion-soft)", fg: "var(--amber)", label: "Pending" },
  approved: { bg: "var(--green-soft)", fg: "var(--green)", label: "Approved" },
  suspended: { bg: "var(--line-soft)", fg: "var(--muted)", label: "Suspended" },
};

function when(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// The admin console is deliberately not part of the learner shell: an admin
// account has no study data and no reason to see the tabs. This is the entire
// surface for that role.
export default function AdminConsole() {
  const { user, getToken, signOut } = useAuth();
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
                  return (
                    <tr key={r.user_id}>
                      <td>
                        <div className="acct">
                          <span className="avatar">{(r.email || "?").slice(0, 1).toUpperCase()}</span>
                          <span>
                            <span className="acct-email">{r.email || r.user_id}</span>
                            <span className="acct-role">
                              {r.role === "admin" && <ShieldCheck size={11} style={{ verticalAlign: -1 }} />}{" "}
                              {r.role}
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
                            <button
                              className="btn tiny-btn"
                              disabled={busy}
                              title={r.role === "admin" ? "Demote to learner" : "Promote to administrator"}
                              onClick={() =>
                                act(
                                  r.user_id,
                                  () => adminSetRole(getToken, r.user_id, r.role === "admin" ? "user" : "admin"),
                                  `${r.email} is now ${r.role === "admin" ? "a learner" : "an administrator"}.`
                                )
                              }
                            >
                              {r.role === "admin" ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                            </button>
                            <button
                              className="btn tiny-btn"
                              disabled={busy}
                              title="Erase this learner's progress"
                              onClick={() => {
                                if (window.confirm(`Erase all study progress for ${r.email}? The account stays.`))
                                  act(r.user_id, () => adminResetProgress(getToken, r.user_id), `Progress cleared for ${r.email}.`);
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
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
      </main>
    </div>
  );
}
