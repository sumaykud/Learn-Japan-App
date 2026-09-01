import { clamp, dayKey } from "./util.js";

// A trimmed SM-2. Four grades, ease factor, interval in days. "again" is
// scheduled in minutes so a lapsed card comes back inside the same session
// instead of vanishing until tomorrow.
export const AGAIN = 0;
export const HARD = 1;
export const GOOD = 2;
export const EASY = 3;

export const GRADES = [
  { id: AGAIN, label: "Again", hint: "No idea" },
  { id: HARD, label: "Hard", hint: "Struggled" },
  { id: GOOD, label: "Good", hint: "Recalled it" },
  { id: EASY, label: "Easy", hint: "Instant" },
];

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export function newCard(now = Date.now()) {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now, seen: 0, updatedAt: now };
}

export function review(card, grade, now = Date.now()) {
  const c = card ? { ...card } : newCard(now);
  c.seen = (c.seen || 0) + 1;
  // Stamped on every grading so two devices that studied the same card offline
  // can be merged by recency rather than by whichever synced last.
  c.updatedAt = now;

  if (grade === AGAIN) {
    c.lapses = (c.lapses || 0) + 1;
    c.reps = 0;
    c.interval = 0;
    c.ease = clamp(c.ease - 0.2, 1.3, 3.0);
    c.due = now + 8 * MINUTE;
    return c;
  }

  if (grade === HARD) {
    c.ease = clamp(c.ease - 0.15, 1.3, 3.0);
    // A brand-new card graded Hard comes back the same day rather than
    // jumping straight into the one-day slot that Good earns.
    c.interval = c.reps === 0 ? 0.5 : Math.max(1, c.interval * 1.2);
  } else if (grade === GOOD) {
    if (c.reps === 0) c.interval = 1;
    else if (c.reps === 1) c.interval = 3;
    else c.interval = c.interval * c.ease;
  } else {
    c.ease = clamp(c.ease + 0.15, 1.3, 3.0);
    if (c.reps === 0) c.interval = 2;
    else if (c.reps === 1) c.interval = 5;
    else c.interval = c.interval * c.ease * 1.3;
  }

  c.interval = Math.min(365, Math.round(c.interval * 10) / 10);
  c.reps += 1;
  c.due = now + c.interval * DAY;
  return c;
}

export function isDue(card, now = Date.now()) {
  return !card || card.due <= now;
}

// new -> learning (sub-day) -> review -> mastered, once the interval clears
// three weeks and the app stops counting the card as active study.
export function stage(card) {
  if (!card || card.seen === 0) return "new";
  // Grading "Again" resets reps, but a card you have already met is relearning,
  // not untouched.
  if (card.reps === 0 || card.interval < 1) return "learning";
  if (card.interval < 21) return "review";
  return "mastered";
}

// Ordered study queue: overdue cards first (most overdue leads), then new
// cards, capped so a session stays finishable.
export function buildQueue(items, cards, { limit = 20, newLimit = 8, now = Date.now() } = {}) {
  const due = [];
  const fresh = [];
  for (const item of items) {
    const card = cards[item.id];
    // Anything already met waits for its due time, lapses included — that is
    // what makes the eight-minute relearning delay actually hold.
    if (!card || card.seen === 0) fresh.push(item);
    else if (card.due <= now) due.push(item);
  }
  due.sort((a, b) => cards[a.id].due - cards[b.id].due);
  const picked = due.slice(0, Math.max(0, limit - Math.min(newLimit, fresh.length)));
  return [...picked, ...fresh.slice(0, newLimit)].slice(0, limit);
}

export function counts(items, cards, now = Date.now()) {
  let neu = 0, learning = 0, review = 0, mastered = 0, dueNow = 0;
  for (const item of items) {
    const card = cards[item.id];
    const s = stage(card);
    if (s === "new") neu++;
    else if (s === "learning") learning++;
    else if (s === "review") review++;
    else mastered++;
    if (card && card.seen > 0 && card.due <= now) dueNow++;
  }
  return { new: neu, learning, review, mastered, dueNow, total: items.length };
}

// Study log keyed by local calendar day, used for the streak and heat strip.
export function logReview(log, correct, now = Date.now()) {
  const k = dayKey(now);
  const day = log[k] || { reviews: 0, correct: 0 };
  return { ...log, [k]: { reviews: day.reviews + 1, correct: day.correct + (correct ? 1 : 0) } };
}

// Counts back from today. An empty today does not break the streak — the day
// is not over yet — but an empty yesterday does.
export function streak(log, now = Date.now()) {
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    const k = dayKey(now - i * DAY);
    if (log[k] && log[k].reviews > 0) n++;
    else if (i > 0) break;
  }
  return n;
}
