import React, { useMemo, useState } from "react";
import { RotateCcw, Volume2 } from "lucide-react";
import { byLevel, grammar, vocab } from "../data/index.js";
import { sample, shuffle } from "../lib/util.js";
import { Furigana, SpeakButton } from "../components/Japanese.jsx";
import { Empty, ProgressLine, SectionHead, Toggle } from "../components/ui.jsx";
import { speak } from "../lib/audio.js";

const ROUND = 10;

const MODES = [
  { id: "meaning", label: "Meaning", hint: "Japanese in, English out" },
  { id: "production", label: "Production", hint: "English in, Japanese out" },
  { id: "listening", label: "Listening", hint: "Audio in, Japanese out" },
  { id: "grammar", label: "Grammar", hint: "Match the pattern to its use" },
];

function buildRound(mode, words, patterns) {
  const source = mode === "grammar" ? patterns : words;
  if (source.length < 4) return [];
  return sample(source, Math.min(ROUND, source.length)).map((answer) => {
    const distractors = sample(
      source.filter((x) => x.id !== answer.id),
      3
    );
    return { answer, options: shuffle([answer, ...distractors]) };
  });
}

export default function QuizScreen({ levels, furi, record }) {
  const [mode, setMode] = useState("meaning");
  const words = useMemo(() => byLevel(vocab, levels), [levels]);
  const patterns = useMemo(() => byLevel(grammar, levels), [levels]);

  const [round, setRound] = useState(() => buildRound("meaning", words, patterns));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);

  const restart = (nextMode = mode) => {
    setMode(nextMode);
    setRound(buildRound(nextMode, words, patterns));
    setIdx(0);
    setPicked(null);
    setScore(0);
  };

  const q = round[idx];

  const modeChips = (
    <div className="chips">
      {MODES.map((m) => (
        <Toggle key={m.id} on={mode === m.id} onClick={() => restart(m.id)} title={m.hint}>
          {m.label}
        </Toggle>
      ))}
    </div>
  );

  if (round.length === 0)
    return (
      <div>
        <SectionHead title="Quiz" right={modeChips} />
        <Empty title="Not enough material">
          This mode needs at least four items. Enable another JLPT level in the header.
        </Empty>
      </div>
    );

  if (!q)
    return (
      <div>
        <SectionHead title="Quiz" right={modeChips} />
        <div className="card" style={{ textAlign: "center", padding: "44px 24px" }}>
          <p className="sub" style={{ margin: 0 }}>Round complete</p>
          <div className="score">
            {score} / {round.length}
          </div>
          <button className="btn primary" style={{ marginTop: 18 }} onClick={() => restart()}>
            <RotateCcw size={14} /> Play again
          </button>
        </div>
      </div>
    );

  const choose = (opt) => {
    if (picked) return;
    const right = opt.id === q.answer.id;
    setPicked(opt.id);
    if (right) setScore((s) => s + 1);
    record?.(right);
    if (mode !== "listening") speak(q.answer.jp || q.answer.pattern);
  };

  const next = () => {
    setPicked(null);
    setIdx((i) => i + 1);
  };

  // Each mode differs only in what the stem shows and what the options read.
  const stem = () => {
    if (mode === "meaning")
      return (
        <>
          <p className="sub" style={{ margin: "0 0 8px" }}>What does this mean?</p>
          <div className="jp jp-lg" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
            <Furigana text={q.answer.jp} mode={furi} />
            <SpeakButton text={q.answer.jp} size={17} />
          </div>
        </>
      );
    if (mode === "production")
      return (
        <>
          <p className="sub" style={{ margin: "0 0 8px" }}>How do you say this in Japanese?</p>
          <div style={{ fontSize: 22 }}>{q.answer.en}</div>
        </>
      );
    if (mode === "listening")
      return (
        <>
          <p className="sub" style={{ margin: "0 0 12px" }}>Listen, then pick what you heard</p>
          <button className="btn" onClick={() => speak(q.answer.jp)}>
            <Volume2 size={16} /> Play again
          </button>
        </>
      );
    return (
      <>
        <p className="sub" style={{ margin: "0 0 8px" }}>Which pattern does this?</p>
        <div style={{ fontSize: 19 }}>{q.answer.en}</div>
        <p className="sub" style={{ margin: "8px 0 0", fontSize: 12 }}>{q.answer.formation}</p>
      </>
    );
  };

  const optionLabel = (opt) => {
    if (mode === "meaning") return <span>{opt.en}</span>;
    if (mode === "grammar")
      return (
        <span className="jp" style={{ fontSize: 16 }}>
          {opt.pattern}
        </span>
      );
    return (
      <span className="jp" style={{ fontSize: 17 }}>
        <Furigana text={opt.jp} mode={mode === "listening" && !picked ? furi : "on"} />
      </span>
    );
  };

  return (
    <div>
      <SectionHead title="Quiz" sub={MODES.find((m) => m.id === mode).hint} right={modeChips} />

      <ProgressLine value={idx} max={round.length} />
      <p className="sub" style={{ margin: "0 0 16px" }}>
        Question {idx + 1} of {round.length} · score {score}
      </p>

      <div className="card" style={{ textAlign: "center", padding: "26px 20px", marginBottom: 16 }}>
        {stem()}
      </div>

      <div className="opts">
        {q.options.map((opt) => {
          const isAnswer = opt.id === q.answer.id;
          const cls = picked ? (isAnswer ? " right" : opt.id === picked ? " wrong" : "") : "";
          return (
            <button key={opt.id} className={`opt${cls}`} onClick={() => choose(opt)} disabled={!!picked}>
              {optionLabel(opt)}
            </button>
          );
        })}
      </div>

      {picked && (
        <button className="btn primary wide" style={{ marginTop: 18 }} onClick={next}>
          {idx + 1 >= round.length ? "See result" : "Next question"}
        </button>
      )}
    </div>
  );
}
