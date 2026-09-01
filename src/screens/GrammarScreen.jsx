import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { byLevel, grammar } from "../data/index.js";
import { Furigana, SpeakButton } from "../components/Japanese.jsx";
import { Empty, SectionHead } from "../components/ui.jsx";

export default function GrammarScreen({ levels, furi }) {
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const scoped = byLevel(grammar, levels);
    const needle = q.trim().toLowerCase();
    if (!needle) return scoped;
    return scoped.filter(
      (g) =>
        g.pattern.toLowerCase().includes(needle) ||
        g.en.toLowerCase().includes(needle) ||
        (g.note || "").toLowerCase().includes(needle)
    );
  }, [levels, q]);

  return (
    <div>
      <SectionHead
        title="Grammar"
        sub={`${list.length} patterns, each with formation notes and two worked examples.`}
        right={
          <label className="chip" style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px" }}>
            <Search size={13} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search patterns"
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                font: "inherit",
                fontSize: 12.5,
                color: "var(--ink)",
                width: 130,
              }}
            />
          </label>
        }
      />

      {list.length === 0 ? (
        <Empty title="Nothing matches">Try a different search term, or enable another level.</Empty>
      ) : (
        <div className="list">
          {list.map((g) => {
            const isOpen = open === g.id;
            return (
              <div key={g.id} className="gram">
                <button className="gram-head" onClick={() => setOpen(isOpen ? null : g.id)} aria-expanded={isOpen}>
                  {isOpen ? <ChevronDown size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
                  <span style={{ flex: 1 }}>
                    <span className="p jp" style={{ display: "block" }}>
                      {g.pattern}
                    </span>
                    <span className="m">{g.en}</span>
                  </span>
                  <span className="tag">{g.level}</span>
                </button>

                {isOpen && (
                  <div className="gram-body">
                    <div className="formation jp">{g.formation}</div>
                    {g.note && <p className="note">{g.note}</p>}
                    {g.examples.map((ex, i) => (
                      <div className="ex" key={i}>
                        <div className="line-body">
                          <span className="jp" style={{ fontSize: 16 }}>
                            <Furigana text={ex.jp} mode={furi} />
                          </span>
                          <SpeakButton text={ex.jp} />
                        </div>
                        <div className="en">{ex.en}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
