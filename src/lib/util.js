export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function uniqueBy(arr, keyFn) {
  const seen = new Set();
  return arr.filter((x) => {
    const k = keyFn(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Local calendar day, not UTC — a streak should roll over at the learner's
// midnight, not at 09:00 JST.
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(aKey, bKey) {
  const a = new Date(`${aKey}T00:00:00`);
  const b = new Date(`${bKey}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

export function formatInterval(days) {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} hr`;
  if (days === 1) return "1 day";
  if (days < 30) return `${Math.round(days)} days`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}
