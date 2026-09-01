import React, { useEffect, useMemo, useState } from "react";
import { Home, MessageSquare, BookOpen, Layers, Blocks, Brain, Type, Moon, Sun, Flame } from "lucide-react";

import { LEVELS, byLevel, vocab } from "./data/index.js";
import { buildQueue, streak } from "./lib/srs.js";
import { useProgress, usePersistentState } from "./lib/useProgress.js";
import { stop } from "./lib/audio.js";

import TodayScreen from "./screens/TodayScreen.jsx";
import DialoguesScreen from "./screens/DialoguesScreen.jsx";
import GrammarScreen from "./screens/GrammarScreen.jsx";
import VocabScreen from "./screens/VocabScreen.jsx";
import BuildScreen from "./screens/BuildScreen.jsx";
import QuizScreen from "./screens/QuizScreen.jsx";
import KanaScreen from "./screens/KanaScreen.jsx";

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
  const [tab, setTab] = useState("today");
  const [levels, setLevels] = usePersistentState("levels", ["N5"]);
  const [furi, setFuri] = usePersistentState("furigana", "on");
  const [theme, setTheme] = usePersistentState("theme", "light");
  const { cards, log, grade, record, reset } = useProgress();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Never let a clip keep playing over a screen the learner has left.
  useEffect(() => {
    stop();
  }, [tab]);

  const scope = useMemo(() => byLevel(vocab, levels), [levels]);
  const ready = useMemo(() => buildQueue(scope, cards, { limit: 20 }).length, [scope, cards]);
  const days = streak(log, Date.now());

  const toggleLevel = (id) =>
    setLevels((prev) => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      // Keep the header chips in JLPT order however they were clicked.
      return LEVELS.map((l) => l.id).filter((x) => prev.includes(x) || x === id);
    });

  const shared = { levels, furi, setFuri, cards, grade, record, log };

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
        {tab === "today" && <TodayScreen {...shared} go={setTab} reset={reset} />}
        {tab === "dialogues" && <DialoguesScreen {...shared} />}
        {tab === "grammar" && <GrammarScreen {...shared} />}
        {tab === "vocab" && <VocabScreen {...shared} />}
        {tab === "build" && <BuildScreen key={levels.join()} {...shared} />}
        {tab === "quiz" && <QuizScreen key={levels.join()} {...shared} />}
        {tab === "kana" && <KanaScreen />}
      </main>
    </div>
  );
}
