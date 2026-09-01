const PREFIX = "learn-japan:";

// Every key is namespaced by a scope so two accounts on one browser never see
// each other's progress, and signing out does not destroy what a guest built
// up before creating an account.
//
//   scope "guest"        -> learn-japan:guest:cards
//   scope "u:<user id>"  -> learn-japan:u:abc123:cards
export const GUEST_SCOPE = "guest";

export function userScope(userId) {
  return `u:${userId}`;
}

function fullKey(scope, key) {
  return `${PREFIX}${scope}:${key}`;
}

export function load(scope, key, fallback) {
  try {
    const raw = localStorage.getItem(fullKey(scope, key));
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(scope, key, value) {
  try {
    localStorage.setItem(fullKey(scope, key), JSON.stringify(value));
    return true;
  } catch {
    // Private mode or quota exceeded. Progress stays in memory for the
    // session; for a signed-in learner the server copy is the real one anyway.
    return false;
  }
}

export function remove(scope, key) {
  try {
    localStorage.removeItem(fullKey(scope, key));
  } catch {
    /* nothing to do */
  }
}

export function clearScope(scope) {
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}${scope}:`)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* nothing to do */
  }
}

export function hasProgress(scope) {
  const cards = load(scope, "cards", null);
  return !!cards && Object.keys(cards).length > 0;
}

export function exportScope(scope) {
  return {
    cards: load(scope, "cards", {}),
    log: load(scope, "log", {}),
    levels: load(scope, "levels", ["N5"]),
    furigana: load(scope, "furigana", "on"),
    theme: load(scope, "theme", "light"),
  };
}
