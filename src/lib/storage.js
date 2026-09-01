const PREFIX = "learn-japan:";

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    // Private mode / quota exceeded. Progress stays in memory for the session.
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to do */
  }
}

export function exportAll() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
    }
  } catch {
    /* return whatever we managed to read */
  }
  return out;
}

export function importAll(data) {
  let n = 0;
  for (const [k, v] of Object.entries(data || {})) {
    if (save(k, v)) n++;
  }
  return n;
}
