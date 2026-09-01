import React from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext.jsx";

const DOT = {
  local: "transparent",
  connecting: "var(--muted)",
  syncing: "var(--indigo-soft)",
  synced: "var(--green)",
  error: "var(--vermillion)",
};

const TITLE = {
  local: "Saved in this browser only",
  connecting: "Connecting to your account…",
  syncing: "Saving your progress…",
  synced: "Progress synced",
  error: "Sync problem — progress is still saved locally",
};

export default function AccountButton({ sync, active, onClick }) {
  const { status, user, configured } = useAuth();

  // With no auth configured there is nothing to sign into, so the control
  // would only raise a question the build cannot answer.
  if (!configured) return null;

  if (status === "signed-in") {
    return (
      <button
        className={`account-btn${active ? " on" : ""}`}
        onClick={onClick}
        title={`${user.email} · ${TITLE[sync.status] || ""}`}
        aria-label="Account"
      >
        <span className="avatar">{(user.email || "?").slice(0, 1).toUpperCase()}</span>
        <span className="sync-dot" style={{ background: DOT[sync.status] || "transparent" }} />
      </button>
    );
  }

  return (
    <button className={`chip${active ? " on" : ""}`} onClick={onClick} title="Sign in to sync across devices">
      <LogIn size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
      Sign in
    </button>
  );
}
