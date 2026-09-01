import { useCallback, useEffect, useState } from "react";
import { load, save, remove } from "./storage.js";
import { review, logReview } from "./srs.js";

// One hook owns every persisted study record: the SRS cards and the per-day
// review log. Screens call grade() and never touch localStorage themselves.
export function useProgress() {
  const [cards, setCards] = useState(() => load("cards", {}));
  const [log, setLog] = useState(() => load("log", {}));

  useEffect(() => {
    save("cards", cards);
  }, [cards]);

  useEffect(() => {
    save("log", log);
  }, [log]);

  const grade = useCallback((id, g) => {
    const now = Date.now();
    setCards((prev) => ({ ...prev, [id]: review(prev[id], g, now) }));
    setLog((prev) => logReview(prev, g >= 2, now));
  }, []);

  // Quizzes and the sentence builder feed the streak without touching the
  // spaced-repetition schedule, which only flashcard grading should move.
  const record = useCallback((correct) => {
    setLog((prev) => logReview(prev, correct, Date.now()));
  }, []);

  const reset = useCallback(() => {
    setCards({});
    setLog({});
    remove("cards");
    remove("log");
  }, []);

  return { cards, log, grade, record, reset };
}

export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => load(key, initial));
  useEffect(() => {
    save(key, value);
  }, [key, value]);
  return [value, setValue];
}
