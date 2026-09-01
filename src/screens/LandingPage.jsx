import React, { useState } from "react";
import { BookOpen, Blocks, Layers, ShieldCheck, TriangleAlert, Volume2 } from "lucide-react";
import { useAuth } from "../lib/auth/AuthContext.jsx";
import { Furigana } from "../components/Japanese.jsx";
import { TOTALS } from "../data/index.js";

const HIGHLIGHTS = [
  { icon: Layers, title: "Spaced repetition", body: `${TOTALS.vocab} words scheduled in both directions — recognition and production.` },
  { icon: Blocks, title: "Build sentences", body: `${TOTALS.sentences} English prompts to assemble in Japanese, piece by piece.` },
  { icon: BookOpen, title: "Grammar with reasons", body: `${TOTALS.grammar} patterns, each with the caveat a dictionary gloss leaves out.` },
  { icon: Volume2, title: "Real dialogues", body: `${TOTALS.dialogues} full scenes with audio. You are always the one being spoken to.` },
];

export default function LandingPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (!res.ok) setError(res.message);
    else if (mode === "up") setSubmitted(true);
  };

  return (
    <div className="landing">
      <div className="landing-inner">
        <section className="landing-pitch">
          <h1 className="landing-mark">日本語</h1>
          <p className="landing-lede">
            Learn Japanese from English, across <strong>JLPT N5 to N2</strong>.
          </p>
          <p className="landing-sub">
            Most apps train you to recognise <span className="jp"><Furigana text="食[た]べる" /></span>. This one also makes you produce it — you get the English, and
            you build the Japanese.
          </p>

          <ul className="landing-list">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title}>
                <span className="ico">
                  <h.icon size={17} />
                </span>
                <span>
                  <strong>{h.title}</strong>
                  <span className="sub">{h.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-form">
          <div className="auth-card" style={{ maxWidth: "none" }}>
            {submitted ? (
              <>
                <h2 style={{ marginTop: 0, fontSize: 17 }}>Account created</h2>
                <p className="sub">
                  Your account is waiting for an administrator to approve it. You will be able to sign in and start
                  studying as soon as that happens.
                </p>
                <button className="btn wide" style={{ marginTop: 14 }} onClick={() => { setSubmitted(false); setMode("in"); }}>
                  Back to sign in
                </button>
              </>
            ) : (
              <>
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

                <p className="landing-note">
                  <ShieldCheck size={14} />
                  <span>
                    New accounts are reviewed by an administrator before they can be used. Your progress then syncs
                    across every device you sign in on.
                  </span>
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
