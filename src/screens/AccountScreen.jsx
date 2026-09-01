import React, { useState } from "react";
import { Cloud, CloudOff, LogOut, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext.jsx";
import { SectionHead } from "../components/ui.jsx";

function SyncBadge({ sync }) {
  const map = {
    local: { icon: CloudOff, text: "This browser only", tone: "var(--muted)" },
    connecting: { icon: RefreshCw, text: "Connecting…", tone: "var(--muted)" },
    syncing: { icon: RefreshCw, text: "Saving…", tone: "var(--indigo-soft)" },
    synced: { icon: Cloud, text: "Synced", tone: "var(--green)" },
    error: { icon: TriangleAlert, text: "Sync problem", tone: "var(--vermillion)" },
  };
  const s = map[sync.status] || map.local;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: s.tone, fontSize: 13 }}>
      <s.icon size={14} /> {s.text}
    </span>
  );
}

function AuthForm() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (!res.ok) setError(res.message);
  };

  return (
    <div className="auth-card">
      <div className="chips" style={{ marginBottom: 20 }}>
        <button className={`chip${mode === "in" ? " on" : ""}`} onClick={() => { setMode("in"); setError(null); }}>
          Sign in
        </button>
        <button className={`chip${mode === "up" ? " on" : ""}`} onClick={() => { setMode("up"); setError(null); }}>
          Create account
        </button>
      </div>

      <form onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            placeholder={mode === "up" ? "At least 8 characters" : ""}
          />
        </label>

        {error && (
          <p className="form-error">
            <TriangleAlert size={14} /> {error}
          </p>
        )}

        <button className="btn primary wide" type="submit" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? "Working…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="sub" style={{ marginTop: 18 }}>
        {mode === "up"
          ? "Your progress will sync across every device you sign in on. Anything you have studied as a guest can be brought with you."
          : "Signing in pulls your saved progress from the server and keeps this browser in step with it."}
      </p>
    </div>
  );
}

export default function AccountScreen({ sync, onReset }) {
  const { status, user, signOut, configured } = useAuth();
  const [confirming, setConfirming] = useState(false);

  if (!configured)
    return (
      <div>
        <SectionHead title="Account" sub="Accounts are switched off in this build." />
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Everything works without an account — your progress is saved in this browser. To turn on accounts and
            cross-device sync, set the three <code>VITE_</code> values described in <code>.env.example</code> and rebuild.
          </p>
          <p className="sub" style={{ marginBottom: 0 }}>
            See <strong>Setting up accounts and sync</strong> in the README for how to create your own Neon project.
          </p>
        </div>
      </div>
    );

  if (status === "loading")
    return (
      <div>
        <SectionHead title="Account" />
        <p className="sub">Checking your session…</p>
      </div>
    );

  if (status !== "signed-in")
    return (
      <div>
        <SectionHead
          title="Account"
          sub="Sign in to sync your progress across devices — or keep studying as a guest, it all works either way."
        />
        <AuthForm />
      </div>
    );

  return (
    <div>
      <SectionHead title="Account" sub="Your progress syncs automatically as you study." />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span className="avatar lg">{(user.email || "?").slice(0, 1).toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{user.email}</div>
            <SyncBadge sync={sync} />
          </div>
          <button className="btn" onClick={signOut}>
            <LogOut size={14} /> Sign out
          </button>
        </div>

        {sync.status === "error" && (
          <p className="form-error" style={{ marginBottom: 0 }}>
            <TriangleAlert size={14} /> {sync.error} — your progress is still saved in this browser and will be sent
            again automatically.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: 0 }}>
          <ShieldCheck size={16} color="var(--green)" style={{ flexShrink: 0, marginTop: 3 }} />
          <span className="sub" style={{ margin: 0 }}>
            Only you can read your rows. Access is enforced by Row Level Security in Postgres against your signed
            token, not by anything the browser decides.
          </span>
        </p>
      </div>

      <div>
        <SectionHead title="Danger zone" sub="This clears your review history on every device, not just this one." />
        {confirming ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              style={{ borderColor: "var(--vermillion)", color: "var(--vermillion)" }}
              onClick={async () => {
                await onReset();
                setConfirming(false);
              }}
            >
              <Trash2 size={14} /> Yes, erase everything
            </button>
            <button className="btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn" onClick={() => setConfirming(true)}>
            <Trash2 size={14} /> Reset all progress
          </button>
        )}
      </div>
    </div>
  );
}
