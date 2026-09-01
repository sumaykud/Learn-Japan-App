import React, { useMemo, useState } from "react";
import { Check, Eye, SkipForward, RotateCcw, Undo2 } from "lucide-react";
import { byLevel, sentences } from "../data/index.js";
import { shuffle } from "../lib/util.js";
import { Furigana, SpeakButton } from "../components/Japanese.jsx";
import { Empty, ProgressLine, SectionHead } from "../components/ui.jsx";
import { speak } from "../lib/audio.js";

const ROUND = 8;
const MIN_CHUNKS = 3;
const MAX_CHUNKS = 9;

// Tiles carry their original index so a sentence that repeats a chunk (two
// お願いします, say) still checks correctly by position rather than by text.
function makeTiles(chunks) {
  return shuffle(chunks.map((text, i) => ({ i, text })));
}

export default function BuildScreen({ levels, furi, record }) {
  const pool = useMemo(
    () => byLevel(sentences, levels).filter((s) => s.chunks.length >= MIN_CHUNKS && s.chunks.length <= MAX_CHUNKS),
    [levels]
  );

  const [round, setRound] = useState(() => shuffle(pool).slice(0, ROUND));
  const [idx, setIdx] = useState(0);
  const [placed, setPlaced] = useState([]);
  // Derived from `round` in the same render pass, so the tiles always belong
  // to the sentence actually on screen.
  const [tiles, setTiles] = useState(() => (round.length ? makeTiles(round[0].chunks) : []));
  const [verdict, setVerdict] = useState(null); // null | "right" | "wrong" | "shown"
  const [score, setScore] = useState({ right: 0, done: 0 });

  const current = round[idx];

  const start = (list) => {
    const next = list ?? shuffle(pool).slice(0, ROUND);
    setRound(next);
    setIdx(0);
    setPlaced([]);
    setTiles(next.length ? makeTiles(next[0].chunks) : []);
    setVerdict(null);
    setScore({ right: 0, done: 0 });
  };

  const goTo = (nextIdx) => {
    setIdx(nextIdx);
    setPlaced([]);
    setTiles(makeTiles(round[nextIdx].chunks));
    setVerdict(null);
  };

  if (pool.length === 0)
    return (
      <div>
        <SectionHead title="Build the sentence" />
        <Empty title="No sentences in scope">Enable at least one JLPT level in the header.</Empty>
      </div>
    );

  if (!current) {
    return (
      <div>
        <SectionHead title="Build the sentence" />
        <div className="card" style={{ textAlign: "center", padding: "44px 24px" }}>
          <p className="sub" style={{ margin: 0 }}>Round complete</p>
          <div className="score">
            {score.right} / {score.done}
          </div>
          <button className="btn primary" style={{ marginTop: 18 }} onClick={() => start()}>
            <RotateCcw size={14} /> Another round
          </button>
        </div>
      </div>
    );
  }

  const check = () => {
    const right = placed.length === current.chunks.length && placed.every((t, i) => t.i === i);
    setVerdict(right ? "right" : "wrong");
    if (right) {
      speak(current.jp);
      setScore((s) => ({ right: s.right + 1, done: s.done + 1 }));
      record?.(true);
    }
  };

  const giveUp = () => {
    setPlaced(current.chunks.map((text, i) => ({ i, text })));
    setVerdict("shown");
    setScore((s) => ({ ...s, done: s.done + 1 }));
    record?.(false);
    speak(current.jp);
  };

  const next = () => {
    if (idx + 1 >= round.length) setIdx(round.length);
    else goTo(idx + 1);
  };

  const usedIdx = new Set(placed.map((t) => t.i));
  const solved = verdict === "right" || verdict === "shown";

  return (
    <div>
      <SectionHead
        title="Build the sentence"
        sub="Read the English, then assemble the Japanese from the pieces below."
      />

      <ProgressLine value={idx} max={round.length} />
      <p className="sub" style={{ margin: "0 0 18px" }}>
        {idx + 1} of {round.length} · {current.level} · from {current.source}
      </p>

      <p className="prompt-en">{current.en}</p>

      <div
        className={`slot${verdict === "wrong" ? " no" : ""}${solved ? " ok" : ""}`}
        style={{ marginTop: 12 }}
      >
        {placed.length === 0 && (
          <span className="sub" style={{ alignSelf: "center" }}>
            Tap the pieces in order
          </span>
        )}
        {placed.map((t, pos) => (
          <button
            key={`${t.i}-${pos}`}
            className="tile"
            disabled={solved}
            onClick={() => {
              setPlaced((p) => p.filter((_, k) => k !== pos));
              setVerdict(null);
            }}
          >
            <span className="jp">
              <Furigana text={t.text} mode={furi} />
            </span>
          </button>
        ))}
      </div>

      {!solved && (
        <div className="tiles">
          {tiles.map((t) => (
            <button
              key={t.i}
              className={`tile${usedIdx.has(t.i) ? " used" : ""}`}
              onClick={() => {
                setPlaced((p) => [...p, t]);
                setVerdict(null);
              }}
            >
              <span className="jp">
                <Furigana text={t.text} mode={furi} />
              </span>
            </button>
          ))}
        </div>
      )}

      {solved && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="line-body">
            <span className="jp" style={{ fontSize: 17 }}>
              <Furigana text={current.jp} mode="on" />
            </span>
            <SpeakButton text={current.jp} />
          </div>
          <p className="sub" style={{ margin: "6px 0 0" }}>
            {verdict === "right" ? "Correct." : "This was the answer."}
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        {!solved ? (
          <>
            <button className="btn primary" onClick={check} disabled={placed.length === 0}>
              <Check size={14} /> Check
            </button>
            <button className="btn" onClick={() => setPlaced([])} disabled={placed.length === 0}>
              <Undo2 size={14} /> Clear
            </button>
            <button className="btn" onClick={giveUp}>
              <Eye size={14} /> Show me
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={next}>
            <SkipForward size={14} /> {idx + 1 >= round.length ? "See result" : "Next sentence"}
          </button>
        )}
      </div>
    </div>
  );
}
