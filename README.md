# Task Timeline

A single-user **timeline task planner** — tasks are cards on a fixed **48-hour** timeline, grouped into color-coded tracks (swimlanes), with drag-to-move/resize, dependency wiring, Markdown notes, a to-do planner, a Pomodoro timer, and a daily "completed" log. It's a **Vite + React 18** app that persists to a tiny on-disk JSON API served by the dev server, and installs as an **offline-capable PWA** on your phone.

The Mac you run it on is the source of truth; a phone just syncs and can view the last-synced board even when the Mac is asleep.

> **Screenshots:** image slots are stubbed below (`docs/screenshots/*.png`). Drop your own captures in — crop/sanitize as you like — and they'll render here.

---

## Screens & features

### Timeline board
![Timeline board](docs/screenshots/timeline.png)

- **48-hour canvas** anchored to local midnight of *today*, with 10-minute ruler ticks, hour labels, and day bands. Re-anchors automatically at midnight so dates never go stale.
- **Horizontal or vertical** orientation (time → right, or time → down with tracks as columns).
- **Live "now" line** — a glowing marker tracks the current time and auto-scrolls into view ("Jump to now").
- **Tracks (swimlanes)** — rename inline, cycle color via the dot, reorder by dragging the handle, add/delete, and drop visual **dividers** between them.
- **Task cards** — double-click empty space to create; drag to move across time and tracks; drag the trailing edge/corner to resize duration. Everything snaps to a 10-minute grid.
- **Marquee select + group move** — rubber-band a region to select; drag any selected card to move the whole group (time-axis only, tracks preserved).
- **Dependencies** — drag from a card's start/end dot onto another card, or use the two-click connect gesture. Rendered as dashed bezier curves; back-to-back same-track links collapse into a chain-link glyph.
- **Progress-aware styling** — cards fade/brighten against the current time and pulse when urgent. Double-click (triple-click on a card) toggles **done**.
- **Density zoom**, **edge auto-scroll** while dragging, **undo/redo**, and task **copy/paste**.

### Task detail + Markdown notes
![Task detail panel with Markdown notes](docs/screenshots/notes.png)

- Right-docked, resizable detail panel per task.
- **Markdown notes** (GFM): code highlighting, interactive checkbox to-dos, and pasted-image upload. Raw HTML is intentionally disabled — safe by default.

### To-do planner
![To-do planner panel](docs/screenshots/todos.png)

- A nestable to-do tree in a side panel. A top-level item with children becomes a **group root**.
- **Schedule to a timeline** — add a to-do to a track and it becomes a board task.
- Assign a group root to a timeline, then one-click **+** on any child adds it straight to that timeline (long-press to pick a different track).
- **Soft delete + Deleted bin** — deleting hides a to-do rather than destroying it; a "deleted" view lets you **restore**, and items are purged 7 days after deletion.
- Show/hide completed to-dos.

### Pomodoro timer
![Pomodoro timer in the header](docs/screenshots/pomodoro.png)

- Header-centered live timer: **Focus (25m) → Short break → Long break** (long break after every 4 focus sessions).
- The header glows the phase color (teal focus / amber break) so the current phase is glanceable. Bind a task to focus on it.

### Completed log
![Completed page with per-day summaries](docs/screenshots/completed.png)

- A dated log of finished tasks with per-day productivity summaries.
- **Collapse toggle** — "Summaries only" hides the tasks so you can scroll day-by-day and see how productive each day was.

### Backlog, Archive & Tags
![Backlog and tag views](docs/screenshots/backlog-tags.png)

- **Backlog** — tasks that age off the 48h canvas are swept here (grouped by scheduled day) instead of vanishing; restore-to-now or drop.
- **Archive** — soft-deleted tracks (with their tasks + notes); restore or purge.
- **Tags** — a global tag pool assigned to tracks, a tag manager, and a tasks-by-tag view.

### Install on your phone (PWA + offline)
![Installed PWA on a phone, offline banner](docs/screenshots/pwa-offline.png)

- Installs to the home screen and launches full-screen.
- A **sync-status pill** in the header shows green (synced) / amber (syncing) / red (offline), with a **Sync now** action and "last synced Xs ago".
- **Offline the phone shows the last synced board, read-only** (a banner explains why) and auto-resyncs the moment the Mac is reachable again. The Mac stays the source of truth, so a stale phone copy can never clobber it.

---

## Getting started

Requires **Node.js 18+** (developed on Node 24).

```bash
npm install
npm run dev        # https or http://localhost:5173 — your working dev server
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR + the `/api/state` persistence API. Your day-to-day. |
| `npm run build` | Production build to `dist/`. |
| `npm run preview` | Serve a built `dist/` locally. |
| `npm run serve` | **Build + serve the production bundle** (`vite preview`) on `:5173`. This is the one you install on the phone — it caches the whole app for offline, and still serves `/api/state` so it syncs from this Mac. |

### Installing the PWA on a phone

The app syncs from, and is served by, your Mac. The phone must reach it over **HTTPS** (service workers require a secure context) on the same Wi-Fi.

1. **TLS cert.** HTTPS needs a cert the phone trusts. Put a key/cert pair at `certs/dev-key.pem` and `certs/dev-cert.pem` (both git-ignored). The easy path is [`mkcert`](https://github.com/FiloSottile/mkcert): install its root CA on your Mac *and* phone once, then mint a leaf for your Mac's LAN IP into `certs/`. Without the certs, the dev/preview servers fall back to plain HTTP (no PWA install).
2. On the Mac: **`npm run serve`** → note the `Network:` URL it prints, e.g. `https://192.168.0.105:5173/`.
3. On the phone (same Wi-Fi), open that URL in Chrome. It should load with no cert warning.
4. Chrome **⋮ → Add to Home screen / Install app.**
5. Open it once while the Mac is awake so the service worker caches everything. After that it opens offline (read-only) and syncs live when the Mac is up.

---

## How persistence works (no real backend)

There is no server app. `vite.config.js` registers a dev-server (and preview-server) middleware that exposes a small JSON API backed by files under `data/` (git-ignored):

- `GET/PUT/POST /api/state` ↔ `data/state.json` — the whole app-state blob, revision-stamped. Clients send the revision they based an edit on; the server refuses a write built on a stale revision (409) so one device can't silently overwrite another's work. Rotating timestamped backups are kept under `data/backups/`.
- `POST /api/assets` + `GET /api/assets/<hash>.<ext>` ↔ `data/assets/` — content-hashed store for images pasted into notes. Only the short URL is stored in state, never the bytes.
- The full board is also mirrored to the browser's `localStorage` on every change — that's the fast first paint and the offline view.

---

## Project layout

```
src/
  App.jsx            One big class component — all state + behavior.
  components/        Mostly-presentational views (Timeline, Header, panels, pages).
  lib/               time/geometry/color helpers, storage + remote clients, pomodoro, todos.
  index.css          Global resets, fonts, keyframes, markdown theme.
public/
  manifest.webmanifest, sw.js, icons/   PWA shell.
vite.config.js       Dev/preview server + the /api/state & /api/assets persistence plugin + HTTPS.
data/                (git-ignored) state.json, assets/, backups/.
certs/               (git-ignored) dev-key.pem / dev-cert.pem for HTTPS.
```

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the deep dive — data model, time math, the `persist()` mutation rule, interaction system, and routing. See **[CLAUDE.md](CLAUDE.md)** for how an AI agent should set up, run, and verify changes here.

---

## Tech

Vite 5 · React 18 (single class component, no router/Redux) · hash-based routing · `react-markdown` + `remark-gfm` + `rehype-highlight` for notes. Front-end only; the "backend" is a Vite middleware writing JSON to disk.
