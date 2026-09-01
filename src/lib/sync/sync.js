import { patch, remove, select, upsert } from "./dataApi.js";

// Local <-> Postgres shape mapping and the merge rules.
//
// The app is local-first: every grading lands in React state and localStorage
// immediately, and a debounced flush pushes it to Neon. That means two devices
// can legitimately diverge, so both directions need a merge rule that is
// deterministic and never silently loses study history.

function cardToRow(userId, cardId, c) {
  return {
    user_id: userId,
    card_id: cardId,
    ease: c.ease,
    interval_days: c.interval,
    reps: c.reps,
    lapses: c.lapses,
    seen: c.seen || 0,
    due: new Date(c.due).toISOString(),
    updated_at: new Date(c.updatedAt || c.due).toISOString(),
  };
}

function rowToCard(r) {
  return {
    ease: r.ease,
    interval: r.interval_days,
    reps: r.reps,
    lapses: r.lapses,
    seen: r.seen,
    due: new Date(r.due).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

// Cards: last write wins, compared on updatedAt. A card is a snapshot of one
// scheduling decision, so the newer decision is simply the right one.
export function mergeCards(local, remote) {
  const out = { ...remote };
  for (const [id, card] of Object.entries(local)) {
    const other = remote[id];
    if (!other || (card.updatedAt || 0) >= (other.updatedAt || 0)) out[id] = card;
  }
  return out;
}

// Review log: per-day maximum, not last-write-wins. The counters only ever
// climb, so taking the larger of the two keeps a day's work that was done on
// another device instead of overwriting it with a smaller local count.
export function mergeLog(local, remote) {
  const out = { ...remote };
  for (const [day, entry] of Object.entries(local)) {
    const other = remote[day];
    out[day] = other
      ? { reviews: Math.max(entry.reviews, other.reviews), correct: Math.max(entry.correct, other.correct) }
      : entry;
  }
  return out;
}

export async function pull(getToken) {
  const [cardRows, logRows] = await Promise.all([
    select(getToken, "srs_cards", "select=*"),
    select(getToken, "review_log", "select=*"),
  ]);

  const cards = {};
  for (const r of cardRows || []) cards[r.card_id] = rowToCard(r);

  const log = {};
  for (const r of logRows || []) log[r.day] = { reviews: r.reviews, correct: r.correct };

  return { cards, log };
}

export async function pushCards(getToken, userId, cards, ids) {
  const rows = [...ids].filter((id) => cards[id]).map((id) => cardToRow(userId, id, cards[id]));
  await upsert(getToken, "srs_cards", rows);
}

export async function pushLog(getToken, userId, log, days) {
  const rows = [...days]
    .filter((d) => log[d])
    .map((d) => ({ user_id: userId, day: d, reviews: log[d].reviews, correct: log[d].correct }));
  await upsert(getToken, "review_log", rows);
}

export async function pushAll(getToken, userId, { cards, log }) {
  await pushCards(getToken, userId, cards, Object.keys(cards));
  await pushLog(getToken, userId, log, Object.keys(log));
}

// Settings go through PATCH on the four columns the authenticated role is
// actually granted. An upsert would need INSERT on profiles, which is revoked
// on purpose — profiles are created only by the ensure_profile() function.
export async function saveSettings(getToken, userId, { levels, furigana, theme }) {
  await patch(getToken, "profiles", `user_id=eq.${encodeURIComponent(userId)}`, { levels, furigana, theme });
}

export async function loadSettings(getToken) {
  const rows = await select(getToken, "profiles", "select=levels,furigana,theme&limit=1");
  return rows && rows.length ? rows[0] : null;
}

// Wipes this account's rows. RLS scopes the delete to the caller, but the
// filter is stated explicitly so the intent is readable and a policy change
// cannot silently widen it.
export async function eraseRemote(getToken, userId) {
  const filter = `user_id=eq.${encodeURIComponent(userId)}`;
  await remove(getToken, "srs_cards", filter);
  await remove(getToken, "review_log", filter);
}
