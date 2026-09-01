import React, { useMemo } from "react";
import { Layers, Blocks, Brain, MessageSquare, BookOpen, Flame, Trash2 } from "lucide-react";
import { byLevel, vocab, sentences, dialogues, grammar } from "../data/index.js";
import { counts, streak } from "../lib/srs.js";
import { dayKey } from "../lib/util.js";
import { Stat, SectionHead, StageBar } from "../components/ui.jsx";

const DAY = 86400000;

function Heat({ log }) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const k = dayKey(Date.now() - i * DAY);
    days.push({ k, n: log[k]?.reviews || 0 });
  }
  const peak = Math.max(1, ...days.map((d) => d.n));
  return (
    <div>
      <div className="heat">
        {days.map((d) => (
          <i
            key={d.k}
            title={`${d.k} · ${d.n} reviews`}
            style={
              d.n
                ? {
                    background: `color-mix(in srgb, var(--green) ${25 + (d.n / peak) * 75}%, transparent)`,
                    borderColor: "transparent",
                  }
                : undefined
            }
          />
        ))}
      </div>
      <p className="sub" style={{ marginTop: 8 }}>
        Last 14 days
      </p>
    </div>
  );
}

function Action({ icon: Icon, title, desc, onClick }) {
  return (
    <button className="action-card" onClick={onClick}>
      <span className="ico">
        <Icon size={19} />
      </span>
      <span>
        <span className="t" style={{ display: "block" }}>
          {title}
        </span>
        <span className="d">{desc}</span>
      </span>
    </button>
  );
}

export default function TodayScreen({ levels, cards, log, go, reset, sync }) {
  const scope = useMemo(() => byLevel(vocab, levels), [levels]);
  const c = useMemo(() => counts(scope, cards), [scope, cards]);
  const days = streak(log, Date.now());
  const sCount = byLevel(sentences, levels).length;
  const dCount = byLevel(dialogues, levels).length;
  const gCount = byLevel(grammar, levels).length;

  const todo = c.dueNow + Math.min(8, c.new);

  return (
    <div style={{ display: "grid", gap: 26 }}>
      <div>
        <SectionHead
          title="Today"
          sub={
            todo > 0
              ? `${todo} card${todo === 1 ? "" : "s"} waiting across ${levels.join(", ")}.`
              : "Nothing is due right now — a good moment to read a dialogue."
          }
          right={
            days > 0 ? (
              <span className="streak">
                <Flame size={12} /> {days} day{days === 1 ? "" : "s"}
              </span>
            ) : null
          }
        />
        <div className="grid grid-3">
          <Stat n={c.dueNow} label="Due for review" tone={c.dueNow ? "var(--vermillion)" : undefined} />
          <Stat n={c.new} label="Not yet started" />
          <Stat n={c.mastered} label="Mastered" tone={c.mastered ? "var(--green)" : undefined} />
        </div>
      </div>

      <div>
        <SectionHead title="Vocabulary progress" sub={`${c.total} words in the levels you have selected`} />
        <div className="card">
          <StageBar counts={c} />
        </div>
      </div>

      <div>
        <SectionHead title="Practise" />
        <div className="grid grid-2">
          <Action
            icon={Layers}
            title="Review vocabulary"
            desc={todo ? `${todo} card${todo === 1 ? "" : "s"} ready` : "Nothing due — study ahead"}
            onClick={() => go("vocab")}
          />
          <Action
            icon={Blocks}
            title="Build sentences"
            desc={`${sCount} English prompts to translate`}
            onClick={() => go("build")}
          />
          <Action icon={Brain} title="Take a quiz" desc="Meaning, production and listening" onClick={() => go("quiz")} />
          <Action icon={MessageSquare} title="Read a dialogue" desc={`${dCount} scenes with audio`} onClick={() => go("dialogues")} />
          <Action icon={BookOpen} title="Study grammar" desc={`${gCount} patterns with examples`} onClick={() => go("grammar")} />
        </div>
      </div>

      <div>
        <SectionHead title="Consistency" />
        <div className="card">
          <Heat log={log} />
        </div>
      </div>

      <div>
        <SectionHead
          title="Your data"
          sub={
            sync && sync.status !== "local"
              ? "Synced to your account — resetting clears it on every device you use."
              : "Stored in this browser only — nothing leaves your machine."
          }
        />
        <button
          className="btn"
          onClick={() => {
            if (window.confirm("Erase every review record and start over? This cannot be undone.")) reset();
          }}
        >
          <Trash2 size={14} /> Reset all progress
        </button>
      </div>
    </div>
  );
}
