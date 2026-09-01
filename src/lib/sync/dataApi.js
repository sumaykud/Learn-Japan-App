// Thin wrapper over the Neon Data API (PostgREST). No client library — the
// three calls we need are plain REST, and the security model lives in Postgres
// RLS rather than in anything this file does.
const BASE = import.meta.env.VITE_NEON_DATA_API_URL || "";

export const syncConfigured = Boolean(BASE);

class DataApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Data API returned ${status}`);
    this.name = "DataApiError";
    this.status = status;
    this.body = body;
  }
}

async function request(getToken, path, init = {}) {
  if (!BASE) throw new DataApiError(0, { message: "Sync is not configured for this build." });

  const token = await getToken();
  if (!token) throw new DataApiError(401, { message: "Not signed in." });

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* PostgREST returns an empty body on some errors */
    }
    throw new DataApiError(res.status, body);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function select(getToken, table, query = "select=*") {
  return request(getToken, `/${table}?${query}`);
}

// PostgREST upsert. resolution=merge-duplicates turns a POST into an
// INSERT ... ON CONFLICT DO UPDATE against the primary key, which is exactly
// the semantics the sync layer wants for (user_id, card_id).
export function upsert(getToken, table, rows) {
  if (!rows.length) return Promise.resolve(null);
  return request(getToken, `/${table}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

export function patch(getToken, table, query, body) {
  return request(getToken, `/${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

export function remove(getToken, table, query) {
  return request(getToken, `/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

export { DataApiError };

// PostgREST exposes Postgres functions at /rpc/<name>. Every privileged action
// in this app is one of these rather than a table write, because a function can
// check admin membership in a way a column grant cannot express.
//
// A 404 here almost always means Neon's Data API schema cache has not seen a
// newly created function yet — see the note at the end of
// db/migrations/002_roles_and_approval.sql. It does not mean "forbidden".
export function rpc(getToken, fn, args = {}) {
  return request(getToken, `/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
}
