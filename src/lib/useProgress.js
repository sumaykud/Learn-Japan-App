import { useCallback, useEffect, useRef, useState } from "react";
import { clearScope, load, save } from "./storage.js";
import { review, logReview } from "./srs.js";
import { syncConfigured } from "./sync/dataApi.js";
import { eraseRemote, mergeCards, mergeLog, pull, pushCards, pushLog } from "./sync/sync.js";

const FLUSH_DELAY = 1500;

// Owns every persisted study record for one scope (a guest, or one account).
//
// Local-first: a grading lands in React state and localStorage immediately and
// is never blocked on the network. Dirty rows are collected and flushed to Neon
// on a short debounce, so a burst of reviews becomes one request.
export function useProgress({ scope, userId, getToken, displayName }) {
  const canSync = Boolean(userId && getToken && syncConfigured);

  const [cards, setCards] = useState(() => load(scope, "cards", {}));
  const [log, setLog] = useState(() => load(scope, "log", {}));
  const [sync, setSync] = useState({ status: canSync ? "connecting" : "local", at: null, error: null });

  const dirtyCards = useRef(new Set());
  const dirtyDays = useRef(new Set());
  const timer = useRef(null);
  // Latest values, readable from the debounced flush without making it a
  // dependency (which would restart the timer on every keystroke of progress).
  const latest = useRef({ cards, log });
  latest.current = { cards, log };

  // Re-read from disk whenever the scope changes — signing in or out swaps
  // which learner's cache we are looking at.
  useEffect(() => {
    setCards(load(scope, "cards", {}));
    setLog(load(scope, "log", {}));
    dirtyCards.current = new Set();
    dirtyDays.current = new Set();
    setSync({ status: canSync ? "connecting" : "local", at: null, error: null });
  }, [scope, canSync]);

  useEffect(() => {
    save(scope, "cards", cards);
  }, [scope, cards]);

  useEffect(() => {
    save(scope, "log", log);
  }, [scope, log]);

  const flush = useCallback(async () => {
    if (!canSync) return;
    const cardIds = dirtyCards.current;
    const days = dirtyDays.current;
    if (cardIds.size === 0 && days.size === 0) return;

    dirtyCards.current = new Set();
    dirtyDays.current = new Set();

    try {
      setSync((s) => ({ ...s, status: "syncing" }));
      await Promise.all([
        pushCards(getToken, userId, latest.current.cards, cardIds),
        pushLog(getToken, userId, latest.current.log, days),
      ]);
      setSync({ status: "synced", at: Date.now(), error: null });
    } catch (err) {
      // Put the rows back so the next flush retries them rather than dropping
      // the review on the floor.
      cardIds.forEach((id) => dirtyCards.current.add(id));
      days.forEach((d) => dirtyDays.current.add(d));
      setSync({ status: "error", at: null, error: err.message });
    }
  }, [canSync, getToken, userId]);

  const scheduleFlush = useCallback(() => {
    if (!canSync) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, FLUSH_DELAY);
  }, [canSync, flush]);

  // On sign-in: pull the server copy, merge it with whatever this browser has
  // cached for the same account, then push the merge back so both sides agree.
  useEffect(() => {
    if (!canSync) return;
    let cancelled = false;

    (async () => {
      try {
        setSync((s) => ({ ...s, status: "connecting" }));
        const remote = await pull(getToken);
        if (cancelled) return;

        const localCards = load(scope, "cards", {});
        const localLog = load(scope, "log", {});
        const mergedCards = mergeCards(localCards, remote.cards);
        const mergedLog = mergeLog(localLog, remote.log);

        setCards(mergedCards);
        setLog(mergedLog);

        // Only rows where the local copy won need writing back.
        const staleCards = Object.keys(mergedCards).filter(
          (id) => !remote.cards[id] || (mergedCards[id].updatedAt || 0) > (remote.cards[id].updatedAt || 0)
        );
        const staleDays = Object.keys(mergedLog).filter((d) => {
          const r = remote.log[d];
          return !r || mergedLog[d].reviews !== r.reviews || mergedLog[d].correct !== r.correct;
        });

        await Promise.all([
          pushCards(getToken, userId, mergedCards, staleCards),
          pushLog(getToken, userId, mergedLog, staleDays),
        ]);
        if (!cancelled) setSync({ status: "synced", at: Date.now(), error: null });
      } catch (err) {
        if (!cancelled) setSync({ status: "error", at: null, error: err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canSync, getToken, userId, scope, displayName]);

  // Flush anything still pending when the scope changes or the tab closes.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      clearTimeout(timer.current);
      flush();
    };
  }, [flush]);

  const grade = useCallback(
    (id, g) => {
      const now = Date.now();
      setCards((prev) => ({ ...prev, [id]: review(prev[id], g, now) }));
      setLog((prev) => logReview(prev, g >= 2, now));
      dirtyCards.current.add(id);
      dirtyDays.current.add(dayKeyOf(now));
      scheduleFlush();
    },
    [scheduleFlush]
  );

  // Quizzes and the sentence builder feed the streak without touching the
  // spaced-repetition schedule, which only flashcard grading should move.
  const record = useCallback(
    (correct) => {
      const now = Date.now();
      setLog((prev) => logReview(prev, correct, now));
      dirtyDays.current.add(dayKeyOf(now));
      scheduleFlush();
    },
    [scheduleFlush]
  );

  // Folds a guest's local progress into this account, then clears the guest
  // cache so the banner does not reappear.
  const importFrom = useCallback(
    async (other) => {
      const mergedCards = mergeCards(other.cards || {}, latest.current.cards);
      const mergedLog = mergeLog(other.log || {}, latest.current.log);
      setCards(mergedCards);
      setLog(mergedLog);
      Object.keys(mergedCards).forEach((id) => dirtyCards.current.add(id));
      Object.keys(mergedLog).forEach((d) => dirtyDays.current.add(d));
      await flush();
    },
    [flush]
  );

  const reset = useCallback(async () => {
    setCards({});
    setLog({});
    dirtyCards.current = new Set();
    dirtyDays.current = new Set();
    clearScope(scope);
    if (canSync) {
      try {
        await eraseRemote(getToken, userId);
        setSync({ status: "synced", at: Date.now(), error: null });
      } catch (err) {
        setSync({ status: "error", at: null, error: err.message });
      }
    }
  }, [scope, canSync, getToken, userId]);

  return { cards, log, grade, record, reset, importFrom, sync, flush };
}

function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function usePersistentState(scope, key, initial) {
  const [value, setValue] = useState(() => load(scope, key, initial));
  const first = useRef(true);

  // Re-read on scope change rather than carrying one account's settings over
  // to the next.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setValue(load(scope, key, initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, key]);

  useEffect(() => {
    save(scope, key, value);
  }, [scope, key, value]);

  return [value, setValue];
}
