import React, { useMemo, useState } from "react";
import { RotateCcw, ArrowLeftRight } from "lucide-react";
import { byLevel, vocab } from "../data/index.js";
import { buildQueue, counts, GRADES, review, stage } from "../lib/srs.js";
import { formatInterval } from "../lib/util.js";
import { Furigana, SpeakButton } from "../components/Japanese.jsx";
import { Empty, ProgressLine, SectionHead, StageBar, Toggle } from "../components/ui.jsx";
import { speak } from "../lib/audio.js";

const SESSION = 20;

export default function VocabScreen({ levels, cards, grade, furi }) {
  // Direction is the whole point of the app: recognising 食べる is a different
  // skill from producing it when you only have "to eat".
  const [dir, setDir] = useState("jp-en");
  const [flipped, setFlipped] = useState(false);
  const [session, setSession] = useState(() => ({ done: 0, ok: 0 }));
  const [nonce, setNonce] = useState(0);

  const scope = useMemo(() => byLevel(vocab, levels), [levels]);
  const stats = useMemo(() => counts(scope, cards), [scope, cards]);

  // Rebuilt whenever cards change, so a card graded "Again" reappears once its
  // eight-minute delay is up without needing an explicit re-queue.
  const queue = useMemo(
    () => buildQueue(scope, cards, { limit: SESSION }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, cards, nonce]
  );

  const current = queue[0];

  const answer = (g) => {
    grade(current.id, g);
    setSession((s) => ({ done: s.done + 1, ok: s.ok + (g >= 2 ? 1 : 0) }));
    setFlipped(false);
  };

  const header = (
    <SectionHead
      title="Vocabulary"
      sub={`${stats.total} words in scope · ${stats.dueNow} due · ${stats.new} not started`}
      right={
        <Toggle
          on={dir === "en-jp"}
          onClick={() => {
            setDir((d) => (d === "jp-en" ? "en-jp" : "jp-en"));
            setFlipped(false);
          }}
          title="Switch which side you see first"
        >
          <ArrowLeftRight size={12} style={{ verticalAlign: -2, marginRight: 5 }} />
          {dir === "jp-en" ? "JP → EN" : "EN → JP"}
        </Toggle>
      }
    />
  );

  if (scope.length === 0)
    return (
      <div>
        {header}
        <Empty title="No words in scope">Enable at least one JLPT level in the header.</Empty>
      </div>
    );

  if (!current)
    return (
      <div>
        {header}
        <div className="card" style={{ textAlign: "center", padding: "44px 24px" }}>
          <p style={{ fontSize: 17, margin: "0 0 4px" }}>Nothing due right now</p>
          <p className="sub" style={{ margin: "0 0 22px" }}>
            {session.done > 0
              ? `You got through ${session.done} card${session.done === 1 ? "" : "s"}, ${session.ok} of them right.`
              : "Every card in these levels is scheduled for a later day."}
          </p>
          <StageBar counts={stats} />
          <button
            className="btn primary"
            style={{ marginTop: 22 }}
            onClick={() => {
              setSession({ done: 0, ok: 0 });
              setNonce((n) => n + 1);
            }}
          >
            <RotateCcw size={14} /> Check again
          </button>
        </div>
      </div>
    );

  const front = dir === "jp-en";
  const cardState = cards[current.id];

  return (
    <div>
      {header}

      <ProgressLine value={session.done} max={session.done + queue.length} />
      <p className="sub" style={{ margin: "0 0 16px" }}>
        {queue.length} left in this batch · {current.level} · {stage(cardState)}
      </p>

      <div
        className="flash"
        onClick={() => setFlipped((f) => !f)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
      >
        {front ? (
          <>
            <div className="jp jp-xl" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Furigana text={current.jp} mode={flipped ? "on" : furi === "kana" ? "kana" : furi} />
              <SpeakButton text={current.jp} size={19} />
            </div>
            {flipped ? (
              <>
                <div className="meaning">{current.en}</div>
                <span className="pos">{current.pos}</span>
              </>
            ) : (
              <div className="hint">Tap to reveal the meaning</div>
            )}
          </>
        ) : (
          <>
            <div className="meaning" style={{ fontSize: 22 }}>
              {current.en}
            </div>
            <span className="pos">{current.pos}</span>
            {flipped ? (
              <div className="jp jp-xl" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                <Furigana text={current.jp} mode="on" />
                <SpeakButton text={current.jp} size={19} />
              </div>
            ) : (
              <div className="hint">Say it in Japanese, then tap to check</div>
            )}
          </>
        )}
      </div>

      {flipped && (
        <div className="grades">
          {GRADES.map((g) => {
            const next = review(cardState, g.id);
            return (
              <button
                key={g.id}
                className={`grade g${g.id}`}
                onClick={() => {
                  if (dir === "en-jp") speak(current.jp);
                  answer(g.id);
                }}
              >
                <div className="g">{g.label}</div>
                <div className="i">{next.interval < 1 ? "8 min" : formatInterval(next.interval)}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
