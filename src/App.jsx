import React, { useEffect, useMemo, useState } from "react";
import { Home, MessageSquare, BookOpen, Layers, Blocks, Brain, Type, Moon, Sun, Flame, Download, X } from "lucide-react";

import { LEVELS, byLevel, vocab } from "./data/index.js";
import { buildQueue, streak } from "./lib/srs.js";
import { useProgress, usePersistentState } from "./lib/useProgress.js";
import { GUEST_SCOPE, exportScope, hasProgress, userScope } from "./lib/storage.js";
import { useAuth } from "./lib/auth/AuthContext.jsx";
import { useProfile } from "./lib/auth/useProfile.js";
import { syncConfigured } from "./lib/sync/dataApi.js";
import { saveSettings } from "./lib/sync/sync.js";
import { stop } from "./lib/audio.js";
import { ROUTES, useRoute } from "./lib/router.js";

import AccountButton from "./components/AccountButton.jsx";
import TodayScreen from "./screens/TodayScreen.jsx";
import DialoguesScreen from "./screens/DialoguesScreen.jsx";
import GrammarScreen from "./screens/GrammarScreen.jsx";
import VocabScreen from "./screens/VocabScreen.jsx";
import BuildScreen from "./screens/BuildScreen.jsx";
import QuizScreen from "./screens/QuizScreen.jsx";
import KanaScreen from "./screens/KanaScreen.jsx";
import AccountScreen from "./screens/AccountScreen.jsx";
import LandingPage from "./screens/LandingPage.jsx";
import GateScreen from "./screens/GateScreen.jsx";
import AdminConsole from "./screens/AdminConsole.jsx";
import AdminLogin from "./screens/AdminLogin.jsx";

const TABS = [
  { id: "today", label: "Today", icon: Home },
  { id: "dialogues", label: "Dialogues", icon: MessageSquare },
  { id: "grammar", label: "Grammar", icon: BookOpen },
  { id: "vocab", label: "Vocabulary", icon: Layers },
  { id: "build", label: "Build", icon: Blocks },
  { id: "quiz", label: "Quiz", icon: Brain },
  { id: "kana", label: "Kana", icon: Type },
];

export default function App() {
  const { status, user, getToken, configured } = useAuth();
  const { profile, state: profileState, error: profileError, reload: reloadProfile } = useProfile(status, getToken);
  const { navigate, isAdminRoute } = useRoute();
  const [tab, setTab] = useState("today");

  // One scope per learner. Signing in or out swaps every persisted key, so two
  // accounts on one browser never see each other's progress.
  const scope = user ? userScope(user.id) : GUEST_SCOPE;

  const [levels, setLevels] = usePersistentState(scope, "levels", ["N5"]);
  const [furi, setFuri] = usePersistentState(scope, "furigana", "on");
  const [theme, setTheme] = usePersistentState(scope, "theme", "light");
  const [importHandled, setImportHandled] = usePersistentState(scope, "guest-import", false);

  const { cards, log, grade, record, reset, importFrom, sync } = useProgress({
    scope,
    userId: user?.id,
    getToken,
    displayName: user?.displayName,
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Never let a clip keep playing over a screen the learner has left.
  useEffect(() => {
    stop();
  }, [tab]);

  // Display preferences follow the account so a new device can adopt them
  // later. They are pushed but never pulled back down — a sign-in should not
  // flip the theme out from under someone mid-session.
  useEffect(() => {
    if (status !== "signed-in" || !syncConfigured) return;
    const id = setTimeout(() => {
      saveSettings(getToken, user.id, { levels, furigana: furi, theme }).catch(() => {
        /* settings are a convenience; a failure here must not surface as an error */
      });
    }, 1200);
    return () => clearTimeout(id);
  }, [status, user, getToken, levels, furi, theme]);

  // An approved admin has no learner UI, so / has nothing to show them. Send
  // them to /admin, replacing the entry so Back does not bounce them straight
  // into the same redirect.
  useEffect(() => {
    if (!configured || isAdminRoute) return;
    if (profile?.role === "admin" && profile.status === "approved") {
      navigate(ROUTES.admin, { replace: true });
    }
  }, [configured, isAdminRoute, profile, navigate]);

  const scopeVocab = useMemo(() => byLevel(vocab, levels), [levels]);
  const ready = useMemo(() => buildQueue(scopeVocab, cards, { limit: 20 }).length, [scopeVocab, cards]);
  const days = streak(log, Date.now());

  const guestWaiting =
    status === "signed-in" && !importHandled && hasProgress(GUEST_SCOPE) && scope !== GUEST_SCOPE;

  const toggleLevel = (id) =>
    setLevels((prev) => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      // Keep the header chips in JLPT order however they were clicked.
      return LEVELS.map((l) => l.id).filter((x) => prev.includes(x) || x === id);
    });

  const shared = { levels, furi, setFuri, cards, grade, record, log };

  // ---- routing and access gates -------------------------------------------
  //
  // Two entrances:
  //   /       the learning site — landing page, then the learner dashboard
  //   /admin  the administration entrance — its own sign-in, then the console
  //
  // Every hook above runs unconditionally; the code below only chooses what to
  // render. Order matters: identity first, then authorisation, then role.
  //
  // The route is convenience, never protection. Anyone can open /admin; what
  // stops them is that the admin RPCs refuse a caller who is not an admin.
  // Reordering these branches cannot leak data — the database would still say
  // no — but it can certainly confuse people, so keep them in this order.
  //
  // With no auth configured (a fresh clone, or a build with no VITE_ values)
  // none of this applies and the app is the open, local-only learner it has
  // always been. Gating only makes sense where there are accounts to gate.
  if (configured) {
    if (status === "loading") return <Splash label="Checking your session…" />;

    if (status !== "signed-in") {
      return isAdminRoute ? <AdminLogin navigate={navigate} /> : <LandingPage />;
    }

    if (profileState === "loading" || profileState === "idle") return <Splash label="Loading your account…" />;
    if (profileState === "error" || !profile)
      return <GateScreen variant="error" detail={profileError} onRetry={reloadProfile} />;
    if (profile.status === "suspended") return <GateScreen variant="suspended" onRetry={reloadProfile} />;
    if (profile.status !== "approved") return <GateScreen variant="pending" onRetry={reloadProfile} />;

    if (profile.role === "admin") {
      // An administrator manages accounts and nothing else — no tabs, no cards.
      // Landing on / has nothing to show them, so send them where they belong.
      if (!isAdminRoute) return <Splash label="Opening administration…" />;
      return <AdminConsole />;
    }

    // A learner who wandered into /admin. Say so plainly and point them home
    // rather than silently redirecting, which would look like a broken link.
    if (isAdminRoute) {
      return (
        <GateScreen
          variant="no-access"
          onRetry={reloadProfile}
          primary={{ label: "Go to my dashboard", onClick: () => navigate(ROUTES.home) }}
        />
      );
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <h1>
              日本語<span className="en">English → Japanese · JLPT N5–N2</span>
            </h1>
            <div className="brand-actions">
              {days > 0 && (
                <span className="streak" title="Consecutive days studied">
                  <Flame size={12} /> {days}
                </span>
              )}
              <div className="chips">
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    className={`chip${levels.includes(l.id) ? " on" : ""}`}
                    onClick={() => toggleLevel(l.id)}
                    title={`${l.name} — ${l.counts.vocab} words, ${l.counts.grammar} patterns`}
                    aria-pressed={levels.includes(l.id)}
                  >
                    {l.id}
                  </button>
                ))}
              </div>
              <button
                className="icon-btn"
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                aria-label="Switch colour theme"
                title="Switch colour theme"
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <AccountButton sync={sync} active={tab === "account"} onClick={() => setTab("account")} />
            </div>
          </div>

          <nav className="nav">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                <t.icon size={15} />
                {t.label}
                {t.id === "vocab" && ready > 0 && <span className="badge">{ready}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {guestWaiting && (
          <div className="banner">
            <Download size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <strong>You have progress from studying as a guest.</strong>
              <div className="sub" style={{ margin: 0 }}>
                Bring it into this account? Your guest progress stays on this browser either way.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn primary"
                onClick={async () => {
                  await importFrom(exportScope(GUEST_SCOPE));
                  setImportHandled(true);
                }}
              >
                Import
              </button>
              <button className="icon-btn" onClick={() => setImportHandled(true)} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {tab === "today" && <TodayScreen {...shared} go={setTab} reset={reset} sync={sync} />}
        {tab === "dialogues" && <DialoguesScreen {...shared} />}
        {tab === "grammar" && <GrammarScreen {...shared} />}
        {tab === "vocab" && <VocabScreen {...shared} />}
        {tab === "build" && <BuildScreen key={levels.join()} {...shared} />}
        {tab === "quiz" && <QuizScreen key={levels.join()} {...shared} />}
        {tab === "kana" && <KanaScreen />}
        {tab === "account" && <AccountScreen sync={sync} onReset={reset} />}
      </main>
    </div>
  );
}

function Splash({ label }) {
  return (
    <div className="gate">
      <div className="gate-card">
        <h2 className="landing-mark" style={{ fontSize: 34, margin: "0 0 10px" }}>
          日本語
        </h2>
        <p className="sub">{label}</p>
      </div>
    </div>
  );
}
