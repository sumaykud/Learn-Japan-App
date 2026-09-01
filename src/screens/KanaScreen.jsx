import React, { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { chart, deck, GROUPS, SCRIPTS } from "../data/kana.js";
import { sample, shuffle } from "../lib/util.js";
import { ProgressLine, SectionHead, Toggle } from "../components/ui.jsx";
import { speak } from "../lib/audio.js";

const ROUND = 12;

function Grid({ rows, youon }) {
  return (
    <div className={`kana-grid${youon ? " youon" : ""}`} style={{ marginBottom: 16 }}>
      {rows.map((row, ri) => (
        <React.Fragment key={ri}>
          <div className="kana-row-label">{row.label || "—"}</div>
          {row.cells.map((cell, ci) =>
            cell ? (
              <button key={ci} className="kana-cell" onClick={() => speak(cell.char)} title={`Play ${cell.romaji}`}>
                <div className="c">{cell.char}</div>
                <div className="r">{cell.romaji}</div>
              </button>
            ) : (
              <div key={ci} className="kana-cell blank" />
            )
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Drill({ script, groups, onExit }) {
  const pool = useMemo(() => deck(script, groups), [script, groups]);
  const [round, setRound] = useState(() =>
    sample(pool, Math.min(ROUND, pool.length)).map((answer) => ({
      answer,
      options: shuffle([answer, ...sample(pool.filter((x) => x.romaji !== answer.romaji), 3)]),
    }))
  );
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);

  const q = round[idx];

  if (!q)
    return (
      <div className="card" style={{ textAlign: "center", padding: "44px 24px" }}>
        <p className="sub" style={{ margin: 0 }}>Drill complete</p>
        <div className="score">
          {score} / {round.length}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
          <button
            className="btn primary"
            onClick={() => {
              setRound(
                sample(pool, Math.min(ROUND, pool.length)).map((answer) => ({
                  answer,
                  options: shuffle([answer, ...sample(pool.filter((x) => x.romaji !== answer.romaji), 3)]),
                }))
              );
              setIdx(0);
              setPicked(null);
              setScore(0);
            }}
          >
            <RotateCcw size={14} /> Again
          </button>
          <button className="btn" onClick={onExit}>
            Back to the chart
          </button>
        </div>
      </div>
    );

  return (
    <div>
      <ProgressLine value={idx} max={round.length} />
      <p className="sub" style={{ margin: "0 0 16px" }}>
        {idx + 1} of {round.length} · score {score}
      </p>

      <div className="card" style={{ textAlign: "center", padding: "34px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 68, lineHeight: 1.1 }}>{q.answer.char}</div>
      </div>

      <div className="opts" style={{ gridTemplateColumns: "repeat(2, 1fr)", display: "grid" }}>
        {q.options.map((opt) => {
          const isAnswer = opt.romaji === q.answer.romaji;
          const cls = picked ? (isAnswer ? " right" : opt.romaji === picked ? " wrong" : "") : "";
          return (
            <button
              key={opt.id}
              className={`opt${cls}`}
              style={{ textAlign: "center" }}
              disabled={!!picked}
              onClick={() => {
                if (picked) return;
                setPicked(opt.romaji);
                if (isAnswer) setScore((s) => s + 1);
                speak(q.answer.char);
              }}
            >
              {opt.romaji}
            </button>
          );
        })}
      </div>

      {picked && (
        <button
          className="btn primary wide"
          style={{ marginTop: 18 }}
          onClick={() => {
            setPicked(null);
            setIdx((i) => i + 1);
          }}
        >
          {idx + 1 >= round.length ? "See result" : "Next"}
        </button>
      )}
    </div>
  );
}

export default function KanaScreen() {
  const [script, setScript] = useState("hiragana");
  const [groups, setGroups] = useState(["gojuon"]);
  const [drilling, setDrilling] = useState(false);

  const c = useMemo(() => chart(script), [script]);
  const meta = SCRIPTS.find((s) => s.id === script);

  const toggleGroup = (id) =>
    setGroups((g) => (g.includes(id) ? (g.length > 1 ? g.filter((x) => x !== id) : g) : [...g, id]));

  return (
    <div>
      <SectionHead
        title="Kana"
        sub={meta.blurb}
        right={
          <div className="chips">
            {SCRIPTS.map((s) => (
              <Toggle key={s.id} on={script === s.id} onClick={() => setScript(s.id)}>
                {s.jp}
              </Toggle>
            ))}
          </div>
        }
      />

      <div className="chips" style={{ marginBottom: 18 }}>
        {GROUPS.map((g) => (
          <Toggle key={g.id} on={groups.includes(g.id)} onClick={() => toggleGroup(g.id)}>
            {g.label}
          </Toggle>
        ))}
        <button className="btn" style={{ marginLeft: "auto", padding: "5px 14px" }} onClick={() => setDrilling((d) => !d)}>
          {drilling ? "Show the chart" : "Drill these"}
        </button>
      </div>

      {drilling ? (
        <Drill key={`${script}-${groups.join()}`} script={script} groups={groups} onExit={() => setDrilling(false)} />
      ) : (
        <>
          {groups.includes("gojuon") && <Grid rows={c.gojuon} />}
          {groups.includes("dakuon") && <Grid rows={c.dakuon} />}
          {groups.includes("youon") && <Grid rows={c.youon} youon />}
          <p className="sub">Tap any character to hear it.</p>
        </>
      )}
    </div>
  );
}
