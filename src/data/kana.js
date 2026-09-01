// The two syllabaries. Only hiragana is spelled out — katakana is derived by
// the fixed +0x60 code-point offset, which holds across the whole standard
// range and saves transcribing a hundred characters by hand.
function kata(hira) {
  return [...hira]
    .map((ch) => {
      const c = ch.codePointAt(0);
      return c >= 0x3041 && c <= 0x3096 ? String.fromCodePoint(c + 0x60) : ch;
    })
    .join("");
}

const GOJUON_ROWS = [
  ["", ["あ", "a"], ["い", "i"], ["う", "u"], ["え", "e"], ["お", "o"]],
  ["k", ["か", "ka"], ["き", "ki"], ["く", "ku"], ["け", "ke"], ["こ", "ko"]],
  ["s", ["さ", "sa"], ["し", "shi"], ["す", "su"], ["せ", "se"], ["そ", "so"]],
  ["t", ["た", "ta"], ["ち", "chi"], ["つ", "tsu"], ["て", "te"], ["と", "to"]],
  ["n", ["な", "na"], ["に", "ni"], ["ぬ", "nu"], ["ね", "ne"], ["の", "no"]],
  ["h", ["は", "ha"], ["ひ", "hi"], ["ふ", "fu"], ["へ", "he"], ["ほ", "ho"]],
  ["m", ["ま", "ma"], ["み", "mi"], ["む", "mu"], ["め", "me"], ["も", "mo"]],
  ["y", ["や", "ya"], null, ["ゆ", "yu"], null, ["よ", "yo"]],
  ["r", ["ら", "ra"], ["り", "ri"], ["る", "ru"], ["れ", "re"], ["ろ", "ro"]],
  ["w", ["わ", "wa"], null, null, null, ["を", "wo"]],
  ["n", ["ん", "n"], null, null, null, null],
];

const DAKUON_ROWS = [
  ["g", ["が", "ga"], ["ぎ", "gi"], ["ぐ", "gu"], ["げ", "ge"], ["ご", "go"]],
  ["z", ["ざ", "za"], ["じ", "ji"], ["ず", "zu"], ["ぜ", "ze"], ["ぞ", "zo"]],
  ["d", ["だ", "da"], ["ぢ", "ji"], ["づ", "zu"], ["で", "de"], ["ど", "do"]],
  ["b", ["ば", "ba"], ["び", "bi"], ["ぶ", "bu"], ["べ", "be"], ["ぼ", "bo"]],
  ["p", ["ぱ", "pa"], ["ぴ", "pi"], ["ぷ", "pu"], ["ぺ", "pe"], ["ぽ", "po"]],
];

const YOUON_ROWS = [
  ["ky", ["きゃ", "kya"], ["きゅ", "kyu"], ["きょ", "kyo"]],
  ["sh", ["しゃ", "sha"], ["しゅ", "shu"], ["しょ", "sho"]],
  ["ch", ["ちゃ", "cha"], ["ちゅ", "chu"], ["ちょ", "cho"]],
  ["ny", ["にゃ", "nya"], ["にゅ", "nyu"], ["にょ", "nyo"]],
  ["hy", ["ひゃ", "hya"], ["ひゅ", "hyu"], ["ひょ", "hyo"]],
  ["my", ["みゃ", "mya"], ["みゅ", "myu"], ["みょ", "myo"]],
  ["ry", ["りゃ", "rya"], ["りゅ", "ryu"], ["りょ", "ryo"]],
  ["gy", ["ぎゃ", "gya"], ["ぎゅ", "gyu"], ["ぎょ", "gyo"]],
  ["j", ["じゃ", "ja"], ["じゅ", "ju"], ["じょ", "jo"]],
  ["by", ["びゃ", "bya"], ["びゅ", "byu"], ["びょ", "byo"]],
  ["py", ["ぴゃ", "pya"], ["ぴゅ", "pyu"], ["ぴょ", "pyo"]],
];

function toScript(rows, script) {
  return rows.map(([label, ...cells]) => ({
    label,
    cells: cells.map((cell) =>
      cell ? { char: script === "katakana" ? kata(cell[0]) : cell[0], romaji: cell[1] } : null
    ),
  }));
}

export function chart(script) {
  return {
    gojuon: toScript(GOJUON_ROWS, script),
    dakuon: toScript(DAKUON_ROWS, script),
    youon: toScript(YOUON_ROWS, script),
  };
}

// Flat drill deck. Each character gets its own id per script, so hiragana か
// and katakana カ are tracked as two separate cards.
export function deck(script, groups = ["gojuon", "dakuon", "youon"]) {
  const c = chart(script);
  const out = [];
  for (const g of groups) {
    for (const row of c[g]) {
      for (const cell of row.cells) {
        if (cell) out.push({ id: `k:${script}:${cell.char}`, char: cell.char, romaji: cell.romaji, script, group: g });
      }
    }
  }
  return out;
}

export const SCRIPTS = [
  { id: "hiragana", label: "Hiragana", jp: "ひらがな", blurb: "Native Japanese words, grammar endings and particles." },
  { id: "katakana", label: "Katakana", jp: "カタカナ", blurb: "Loanwords, foreign names, onomatopoeia and emphasis." },
];

export const GROUPS = [
  { id: "gojuon", label: "Basic", jp: "五十音" },
  { id: "dakuon", label: "Voiced", jp: "濁音・半濁音" },
  { id: "youon", label: "Combined", jp: "拗音" },
];
