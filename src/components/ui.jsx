import React from "react";
import { ChevronLeft } from "lucide-react";

export function SectionHead({ title, sub, right }) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Back({ onClick, label = "Back" }) {
  return (
    <button className="back" onClick={onClick}>
      <ChevronLeft size={15} /> {label}
    </button>
  );
}

export function Stat({ n, label, tone }) {
  return (
    <div className="stat">
      <div className="n" style={tone ? { color: tone } : undefined}>
        {n}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="sub">{children}</p>}
    </div>
  );
}

export function Toggle({ on, onClick, children, title }) {
  return (
    <button className={`chip${on ? " on" : ""}`} onClick={onClick} title={title} aria-pressed={on}>
      {children}
    </button>
  );
}

// Stacked bar of SRS stages. Widths are percentages of the whole collection,
// so an empty segment simply collapses to nothing.
export function StageBar({ counts }) {
  const total = Math.max(1, counts.total);
  const parts = [
    { k: "mastered", n: counts.mastered, c: "var(--green)", l: "Mastered" },
    { k: "review", n: counts.review, c: "var(--indigo-soft)", l: "In review" },
    { k: "learning", n: counts.learning, c: "var(--amber)", l: "Learning" },
    { k: "new", n: counts.new, c: "var(--line)", l: "Not started" },
  ];
  return (
    <div>
      <div className="bar">
        {parts.map((p) => (
          <span key={p.k} style={{ width: `${(p.n / total) * 100}%`, background: p.c }} />
        ))}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.k}>
            <i style={{ background: p.c }} />
            {p.l} {p.n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProgressLine({ value, max }) {
  return (
    <div className="progress-line">
      <span style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}
