import React from "react";
import { Clock, LogOut, RefreshCw, Ban, TriangleAlert } from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext.jsx";

// Shown when a learner is signed in but not allowed to study: waiting for
// approval, suspended, or the profile lookup itself failed.
const VARIANTS = {
  pending: {
    icon: Clock,
    tone: "var(--amber)",
    title: "Waiting for approval",
    body: "Your account has been created and is queued for an administrator to review. Nothing else is needed from you — check back shortly.",
  },
  suspended: {
    icon: Ban,
    tone: "var(--vermillion)",
    title: "Account suspended",
    body: "An administrator has suspended this account. Your study history is kept and will return if the account is reinstated.",
  },
  error: {
    icon: TriangleAlert,
    tone: "var(--vermillion)",
    title: "Could not load your account",
    // Deliberately does not claim this is temporary: the most common cause is a
    // half-configured deployment, and telling someone to wait it out would send
    // them looking in the wrong place.
    body: "Your profile could not be read. The detail below says why.",
  },
};

export default function GateScreen({ variant = "pending", detail, onRetry }) {
  const { user, signOut } = useAuth();
  const v = VARIANTS[variant] || VARIANTS.pending;

  return (
    <div className="gate">
      <div className="gate-card">
        <span className="gate-icon" style={{ color: v.tone }}>
          <v.icon size={30} />
        </span>
        <h2>{v.title}</h2>
        <p className="sub">{v.body}</p>

        {user && (
          <p className="gate-email">
            Signed in as <strong>{user.email}</strong>
          </p>
        )}

        {detail && <p className="form-error" style={{ justifyContent: "center" }}>{detail}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={onRetry}>
            <RefreshCw size={14} /> Check again
          </button>
          <button className="btn" onClick={signOut}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
