import React, { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, LogOut, ShieldCheck, ShieldPlus, TriangleAlert } from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext.jsx";
import { claimSuperadmin, superadminSetupAvailable } from "../lib/sync/account.js";
import { ROUTES, href } from "../lib/router.js";

// /admin/setup — the one-time door to the first superadmin account.
//
// Two steps because the claim needs a signed-in caller: the server reads the
// user from the JWT, so there is nobody to promote until an account exists.
//   1. signed out: create an account, or sign in to one
//   2. signed in:  enter the setup code minted in the database
//
// What makes this safe is the code, not this page. Only someone who can run
// SQL on the database can mint one (db/migrations/005_superadmin_setup.sql),
// and claim_superadmin() refuses outright once any superadmin exists. The page
// merely asks politely first so nobody types a code into a closed door.
export default function SetupScreen({ navigate, onClaimed }) {
  const { status } = useAuth();
  return (
    <div className="gate admin-login">
      <div className="auth-card">
        <div className="admin-login-head">
          <span className="admin-login-icon">
            <ShieldPlus size={20} />
          </span>
          <div>
            <h1>First-time setup</h1>
            <p className="sub">Create the superadmin account for 日本語</p>
          </div>
        </div>

        {status === "signed-in" ? <ClaimStep navigate={navigate} onClaimed={onClaimed} /> : <AccountStep />}

        <a
          className="back"
          href={href(ROUTES.admin)}
          style={{ marginTop: 20, marginBottom: 0, textDecoration: "none" }}
          onClick={(e) => {
            e.preventDefault();
            navigate(ROUTES.admin);
          }}
        >
          <ArrowLeft size={15} /> Back to administrator sign-in
        </a>
      </div>
    </div>
  );
}

function StepLabel({ n, children }) {
  // .sub carries no margin of its own, so the gap to what follows is set here.
  return (
    <p className="sub" style={{ margin: "0 0 16px", lineHeight: 1.55 }}>
      <strong>Step {n} of 2</strong> — {children}
    </p>
  );
}

function AccountStep() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = mode === "up" ? await signUp(email, password) : await signIn(email, password);
    setBusy(false);
    // On success the session flips to signed-in and App re-renders this page
    // at step 2. Nothing else to do here.
    if (!res.ok) setError(res.message);
  };

  const pick = (m) => {
    setMode(m);
    setError(null);
  };

  return (
    <>
      <StepLabel n={1}>create the account that will become superadmin. You enter the setup code next.</StepLabel>

      <div className="chips" style={{ marginBottom: 20 }}>
        <button className={`chip${mode === "up" ? " on" : ""}`} onClick={() => pick("up")}>
          Create account
        </button>
        <button className={`chip${mode === "in" ? " on" : ""}`} onClick={() => pick("in")}>
          I already have one
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
          {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
        </button>
      </form>
    </>
  );
}

function ClaimStep({ navigate, onClaimed }) {
  const { user, getToken, signOut } = useAuth();
  const [open, setOpen] = useState(null); // null while asking, then true | false
  const [checkError, setCheckError] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    superadminSetupAvailable(getToken)
      .then((v) => live && setOpen(Boolean(v)))
      .catch((err) => live && setCheckError(explain(err)));
    return () => {
      live = false;
    };
  }, [getToken]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await claimSuperadmin(getToken, code);
      // Reload first so App already holds the superadmin profile when the
      // route changes; the other order flashes "Waiting for approval".
      await onClaimed();
      navigate(ROUTES.admin, { replace: true });
    } catch (err) {
      setBusy(false);
      // Someone else finished setup between the page loading and this submit.
      if (/setup already completed/i.test(err?.message || "")) setOpen(false);
      else setError(explain(err));
    }
  };

  const signedInAs = user && (
    <p className="gate-email" style={{ textAlign: "left" }}>
      Signed in as <strong>{user.email}</strong>
    </p>
  );

  if (checkError) {
    return (
      <>
        {signedInAs}
        <p className="form-error">
          <TriangleAlert size={14} /> {checkError}
        </p>
      </>
    );
  }

  if (open === null) return <p className="sub">Checking whether setup is still open…</p>;

  if (!open) {
    return (
      <>
        <p className="sub" style={{ marginTop: 0 }}>
          <ShieldCheck size={14} style={{ verticalAlign: -2, color: "var(--green)" }} />{" "}
          <strong>Setup is already complete.</strong> This site has a superadmin, so this page no longer does anything.
          New administrators are appointed from the admin console by an existing superadmin.
        </p>
        {signedInAs}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button className="btn primary" onClick={() => navigate(ROUTES.admin, { replace: true })}>
            Go to administration
          </button>
          <button className="btn" onClick={signOut}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <StepLabel n={2}>enter the setup code. This account becomes the superadmin and the code stops working.</StepLabel>
      {signedInAs}

      <form onSubmit={submit}>
        <label className="field">
          <span>Setup code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", letterSpacing: "0.02em" }}
            autoFocus
          />
        </label>

        {error && (
          <p className="form-error">
            <TriangleAlert size={14} /> {error}
          </p>
        )}

        <button className="btn primary wide" type="submit" disabled={busy || !code.trim()} style={{ marginTop: 6 }}>
          <KeyRound size={14} /> {busy ? "Checking…" : "Become superadmin"}
        </button>
      </form>

      <p className="landing-note">
        <KeyRound size={14} />
        <span>
          No code? Someone with access to the database mints one with{" "}
          <code>select public.create_superadmin_setup_code();</code> It is valid for 24 hours and works once.
        </span>
      </p>
    </>
  );
}

// The Data API's own wording is accurate but not actionable. The 404 case is
// worth spelling out: it is the schema-cache trap, not a missing feature.
function explain(err) {
  if (err?.status === 404) {
    return "The setup functions were not found. If the migrations were just applied, reload the Data API schema cache (Neon console → Data API → save settings) and try again.";
  }
  return err?.message || "Something went wrong. Please try again.";
}
