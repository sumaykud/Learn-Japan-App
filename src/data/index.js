import n5 from "./n5.js";
import n4 from "./n4.js";
import n3 from "./n3.js";
import n2 from "./n2.js";
import { stripFurigana, toKana, toChunks, toSpeech } from "../lib/furigana.js";
import { audioKey } from "../lib/hash.js";
import { uniqueBy } from "../lib/util.js";

const RAW = [n5, n4, n3, n2];

export const LEVELS = RAW.map((l) => ({
  id: l.level,
  name: l.name,
  blurb: l.blurb,
  counts: { vocab: l.vocab.length, grammar: l.grammar.length, dialogues: l.dialogues.length },
}));

export const LEVEL_IDS = LEVELS.map((l) => l.id);

// Ids are derived from the content itself rather than from array position, so
// reordering or inserting entries never silently reassigns a learner's SRS
// history to a different word.
export const vocab = RAW.flatMap((l) =>
  l.vocab.map((v) => ({
    ...v,
    id: `v:${l.level}:${stripFurigana(v.jp)}`,
    level: l.level,
    plain: stripFurigana(v.jp),
    kana: toKana(v.jp),
  }))
);

export const grammar = RAW.flatMap((l) =>
  l.grammar.map((g) => ({
    ...g,
    id: g.key,
    level: l.level,
    examples: g.examples.map((ex) => ({ ...ex, plain: stripFurigana(ex.jp) })),
  }))
);

export const dialogues = RAW.flatMap((l) =>
  l.dialogues.map((d) => ({
    ...d,
    id: d.key,
    level: l.level,
    lines: d.lines.map((line, i) => ({
      ...line,
      id: `${d.key}:${i}`,
      plain: stripFurigana(line.jp),
      chunks: toChunks(line.jp),
    })),
  }))
);

// The production bank: English in, Japanese out. Dialogue lines carry the
// natural spoken register; grammar examples cover patterns no dialogue
// happened to use.
export const sentences = uniqueBy(
  [
    ...dialogues.flatMap((d) =>
      d.lines.map((line) => ({
        id: `s:${audioKey(line.plain)}`,
        jp: line.jp,
        en: line.en,
        level: d.level,
        source: d.title,
        sourceId: d.id,
        kind: "dialogue",
        chunks: line.chunks,
      }))
    ),
    ...grammar.flatMap((g) =>
      g.examples.map((ex) => ({
        id: `s:${audioKey(ex.plain)}`,
        jp: ex.jp,
        en: ex.en,
        level: g.level,
        source: g.pattern,
        sourceId: g.id,
        kind: "grammar",
        chunks: toChunks(ex.jp),
      }))
    ),
  ],
  (s) => s.id
);

export function byLevel(items, levels) {
  if (!levels || levels.length === 0) return items;
  const set = new Set(levels);
  return items.filter((x) => set.has(x.level));
}

// Every distinct phrase the app can speak, for scripts/build_audio_manifest.mjs.
export function audioPhrases() {
  const seen = new Map();
  const add = (text) => {
    const phrase = toSpeech(text);
    if (phrase && !seen.has(phrase)) seen.set(phrase, { id: audioKey(phrase), text: phrase });
  };
  vocab.forEach((v) => add(v.jp));
  dialogues.forEach((d) => d.lines.forEach((line) => add(line.jp)));
  grammar.forEach((g) => g.examples.forEach((ex) => add(ex.jp)));
  return [...seen.values()];
}

export const TOTALS = {
  vocab: vocab.length,
  grammar: grammar.length,
  dialogues: dialogues.length,
  sentences: sentences.length,
};
