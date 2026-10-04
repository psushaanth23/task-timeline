// Remote (on-disk) state store client.
//
// Talks to the dev-server JSON state API (see vite.config.js) which persists
// app state to <repoRoot>/data/state.json and stamps it with a revision.
//
// Why revisions: the same file is shared by every device pointed at this dev
// server (laptop + phone). Without them, a device holding an old snapshot can
// PUT it over newer work and the newer tasks are simply gone. Each client sends
// the `rev` it last read as `baseRev`; the server refuses a write built on a
// stale revision (409) and hands back the current state instead.
//
// API contract consumed here:
//   GET  /api/state -> 200 { ...state, rev }   (tasks: null when nothing saved)
//   PUT  /api/state -> body { ...state, baseRev } ->
//                        200 { ok: true, rev } | 409 { conflict, rev, state }

const ENDPOINT = '/api/state';

// Load persisted state from disk. Always returns a result object so callers can
// tell the three cases apart — that distinction is what stops a failed fetch
// from being mistaken for "nothing saved yet" and overwritten.
//   { ok: true,  state, rev }   state on disk
//   { ok: true,  empty: true }  server reachable, nothing saved yet
//   { ok: false }               couldn't reach/parse the server — do NOT write
//
// Note: the full board is already mirrored to this device's localStorage on every
// change (see lib/storage.js), and the app fast-paints from that on boot. So the
// offline VIEW comes from that cache; this loader just reports reachability.
export async function loadState() {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    if (!data) return { ok: false };
    const rev = typeof data.rev === 'number' ? data.rev : 0;
    if (data.tasks === null || data.tasks === undefined) return { ok: true, empty: true, rev };
    return { ok: true, state: data, rev };
  } catch (e) {
    return { ok: false };
  }
}

// Persist state to disk.
//   baseRev: the revision this edit was built on (null on a first write).
//   force:   true bypasses the check — only for "the user just edited here".
// Returns { ok, rev } | { conflict: true, rev, state } | { ok: false }.
export async function saveState(state, baseRev = null, force = false) {
  try {
    const body = { ...state };
    if (baseRev !== null) body.baseRev = baseRev;
    if (force) body.force = true;
    const res = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => null);
      return { ok: false, conflict: true, rev: data && data.rev, state: data && data.state };
    }
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => null);
    if (!(data && data.ok)) return { ok: false };
    return { ok: true, rev: typeof data.rev === 'number' ? data.rev : null };
  } catch (e) {
    return { ok: false };
  }
}

// Last-gasp save when the page is going away. sendBeacon survives a tab close
// and a phone switching apps, where a normal fetch is cancelled.
//
// It CANNOT read the response, so it must never force. A backgrounded phone tab
// holding a stale snapshot used to force this write and silently wipe good work
// on another device. Instead we send the client's own baseRev: the server
// accepts it only if this tab is still current, and drops it (409, unread) if
// this tab is stale — which is exactly the outcome we want. A first-ever write
// (baseRev null) is still allowed so seeding an empty server keeps working.
export function saveStateBeacon(state, baseRev = null) {
  try {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
    const payload = { ...state };
    if (baseRev !== null) payload.baseRev = baseRev;
    const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return navigator.sendBeacon(ENDPOINT, body);
  } catch (e) {
    return false;
  }
}
