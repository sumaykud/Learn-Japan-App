import React, { useState } from "react";
import { ArrowLeft, ShieldCheck, TriangleAlert } from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext.jsx";
import { ROUTES, href } from "../lib/router.js";

// The administrator entrance. Deliberately has no "create account" tab:
// administrators are appointed by a superadmin, and the very first superadmin
// is made once through /admin/setup with a code minted in the database.
//
// Worth being clear that this page is convenience, not security. Anyone may
// open /admin; what stops them is that admin_list_accounts() refuses a caller
// who is not an admin. The URL protects nothing on its own.
export default function AdminLogin({ navigate }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) setError(res.message);
    // On success App re-routes: an admin stays here, anyone else is told they
    // are in the wrong place.
  };

  return (
    <div className="gate admin-login">
      <div className="auth-card">
        <div className="admin-login-head">
          <span className="admin-login-icon">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h1>Administration</h1>
            <p className="sub">Account management for 日本語</p>
          </div>
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
              placeholder="admin@example.com"
              autoFocus
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {error && (
            <p className="form-error">
              <TriangleAlert size={14} /> {error}
            </p>
          )}

          <button className="btn primary wide" type="submit" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <a
          className="back"
          href={href(ROUTES.home)}
          style={{ marginTop: 20, marginBottom: 0, textDecoration: "none" }}
          onClick={(e) => {
            e.preventDefault();
            navigate(ROUTES.home);
          }}
        >
          <ArrowLeft size={15} /> Back to the learning site
        </a>
      </div>
    </div>
  );
}
