// Remote (on-disk) state store client.
//
// Talks to the dev-server JSON state API (see vite.config.js) which persists
// app state to <repoRoot>/data/state.json.
//
// State shape (flexible — the caller decides what to persist):
//   {
//     tasks:  Array   | null,   // task objects (null means "nothing saved yet")
//     tracks: Array   | undefined,
//     view:   Object  | undefined  // view prefs incl. zoom
//   }
//
// API contract consumed here:
//   GET  /api/state -> 200 { ...state } (or { tasks: null } when nothing saved)
//   PUT  /api/state -> body: JSON.stringify(state) -> 200 { ok: true }

const ENDPOINT = '/api/state';

// Load persisted state from disk.
// Returns the parsed state object (e.g. { tasks, tracks, view }) or null on
// any error or when there is nothing meaningful saved yet.
export async function loadState() {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return null;
    const data = await res.json();
    // Server returns { tasks: null } when there is no saved state.
    if (!data || data.tasks === null || data.tasks === undefined) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// Persist state to disk. Pass a flexible object, e.g. { tasks, tracks, view }.
// Returns true on success, false on any failure so the caller can fall back to
// localStorage.
export async function saveState(state) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!(data && data.ok);
  } catch (e) {
    return false;
  }
}
