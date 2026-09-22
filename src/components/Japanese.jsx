import React from "react";
import { Volume2, Turtle } from "lucide-react";
import { segments, stripFurigana, toKana } from "../lib/furigana.js";
import { speak, SLOW_RATE } from "../lib/audio.js";

// Renders authored text like "食[た]べる" as real <ruby>, so the reading sits
// above the kanji instead of interrupting the sentence. mode "off" hides the
// readings; "kana" replaces the kanji entirely, which is how a beginner
// actually wants to read a sentence they cannot decode yet.
export function Furigana({ text, mode = "on" }) {
  if (mode === "kana") return <>{toKana(text)}</>;
  if (mode === "off") return <>{stripFurigana(text)}</>;

  return (
    <>
      {segments(text).map((seg, i) =>
        seg.kanji ? (
          <ruby key={i}>
            {seg.kanji}
            <rt>{seg.reading}</rt>
          </ruby>
        ) : (
          // Authoring spaces are layout only and must not reach the reader.
          <React.Fragment key={i}>{seg.text.replace(/\s+/g, "")}</React.Fragment>
        )
      )}
    </>
  );
}

export function SpeakButton({ text, size = 14, label = "Play audio" }) {
  return (
    <span className="speak-group">
      <button
        className="speak"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          speak(text);
        }}
      >
        <Volume2 size={size} />
      </button>
      <button
        className="speak speak-slow"
        aria-label="Play slowly"
        title="Play slowly"
        onClick={(e) => {
          e.stopPropagation();
          speak(text, { rate: SLOW_RATE });
        }}
      >
        <Turtle size={size} />
      </button>
    </span>
  );
}

export function JpLine({ text, mode, className = "jp", size = 14 }) {
  return (
    <div className="line-body">
      <span className={className}>
        <Furigana text={text} mode={mode} />
      </span>
      <SpeakButton text={text} size={size} />
    </div>
  );
}
