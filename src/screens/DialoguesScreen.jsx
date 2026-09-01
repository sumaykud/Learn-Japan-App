import React, { useEffect, useRef, useState } from "react";
import { Play, Square, Languages, Eye } from "lucide-react";
import { byLevel, dialogues } from "../data/index.js";
import { Furigana, SpeakButton } from "../components/Japanese.jsx";
import { Back, Empty, SectionHead, Toggle } from "../components/ui.jsx";
import { playAll, stop } from "../lib/audio.js";

const FURI_MODES = [
  { id: "on", label: "Furigana" },
  { id: "off", label: "Kanji only" },
  { id: "kana", label: "All kana" },
];

function Detail({ scene, onBack, furi, setFuri }) {
  const [showEn, setShowEn] = useState(true);
  const [playing, setPlaying] = useState(-1);
  const cancelRef = useRef(null);

  // Leaving mid-playback must not leave a voice talking over the next screen.
  useEffect(() => () => {
    cancelRef.current?.();
    stop();
  }, []);

  const toggleAll = () => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
      setPlaying(-1);
      return;
    }
    cancelRef.current = playAll(
      scene.lines.map((l) => l.jp),
      {
        onIndex: (i) => {
          setPlaying(i);
          if (i === -1) cancelRef.current = null;
        },
      }
    );
  };

  return (
    <div>
      <Back onClick={onBack} label="All dialogues" />

      <SectionHead
        title={scene.title}
        sub={scene.setting}
        right={
          <div className="chips">
            <Toggle on={showEn} onClick={() => setShowEn((v) => !v)}>
              <Languages size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
              English
            </Toggle>
            {FURI_MODES.map((m) => (
              <Toggle key={m.id} on={furi === m.id} onClick={() => setFuri(m.id)}>
                {m.id === "on" && <Eye size={12} style={{ verticalAlign: -2, marginRight: 4 }} />}
                {m.label}
              </Toggle>
            ))}
          </div>
        }
      />

      <p style={{ margin: "0 0 18px" }}>
        <span className="tag">{scene.level}</span>{" "}
        <span className="jp" style={{ color: "var(--muted)", fontSize: 14 }}>
          <Furigana text={scene.jp} mode={furi} />
        </span>
      </p>

      <button className="btn" onClick={toggleAll} style={{ marginBottom: 18 }}>
        {playing >= 0 ? <Square size={14} /> : <Play size={14} />}
        {playing >= 0 ? "Stop" : "Play the whole scene"}
      </button>

      <div className="turns">
        {scene.lines.map((line, i) => {
          const you = line.s === "B";
          return (
            <div key={line.id} className={`turn${you ? " you" : ""}`}>
              <div
                className="bubble"
                style={playing === i ? { boxShadow: "0 0 0 2px var(--vermillion)" } : undefined}
              >
                <div className="who">{you ? scene.b : scene.a}</div>
                <div className="line-body">
                  <span className="jp">
                    <Furigana text={line.jp} mode={furi} />
                  </span>
                  <SpeakButton text={line.jp} />
                </div>
                {showEn && <div className="tr">{line.en}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DialoguesScreen({ levels, furi, setFuri }) {
  const [openId, setOpenId] = useState(null);
  const list = byLevel(dialogues, levels);
  const scene = list.find((d) => d.id === openId);

  if (scene) return <Detail scene={scene} onBack={() => setOpenId(null)} furi={furi} setFuri={setFuri} />;

  if (list.length === 0)
    return <Empty title="No dialogues in scope">Turn on another JLPT level in the header.</Empty>;

  return (
    <div>
      <SectionHead title="Dialogues" sub="Full scenes with audio, furigana and translation. You are speaker B." />
      <div className="list">
        {list.map((d) => (
          <button key={d.id} className="row-card" onClick={() => setOpenId(d.id)}>
            <div className="rt">
              {d.title} <span className="tag">{d.level}</span>
            </div>
            <div className="rd">
              {d.setting} · {d.lines.length} lines
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
