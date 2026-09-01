// Content convention: kanji runs carry their reading in square brackets,
// e.g. "食[た]べる", "今日[きょう]は 暑[あつ]いですね".
// Bunsetsu are separated by ASCII spaces, which the sentence builder uses
// to cut a line into tiles. Spaces are never rendered in Japanese text.
const RUBY = /([\u4E00-\u9FFF\u3005\u3007\u303B]+)\[([^\]]+)\]/g;

// "食[た]べる" -> "食べる" (what a reader sees with furigana off)
export function stripFurigana(text) {
  return text.replace(RUBY, "$1").replace(/\s+/g, "");
}

// "食[た]べる" -> "たべる" (full reading; also what we hand to speech synthesis)
export function toKana(text) {
  return text.replace(RUBY, "$2").replace(/\s+/g, "");
}

// The exact string sent to VOICEVOX / the audio manifest. Kanji is kept
// (the engine reads it better than bare kana) but the layout spaces go.
export function toSpeech(text) {
  return stripFurigana(text);
}

// Cut a line into bunsetsu tiles on the authoring spaces.
export function toChunks(text) {
  return text.split(/\s+/).filter(Boolean);
}

// [{ kanji, reading }] | { text } segments, for rendering as <ruby> or plain.
export function segments(text) {
  const out = [];
  let last = 0;
  let m;
  RUBY.lastIndex = 0;
  while ((m = RUBY.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ kanji: m[1], reading: m[2] });
    last = RUBY.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function hasKanji(text) {
  return /[\u4E00-\u9FFF]/.test(text);
}
