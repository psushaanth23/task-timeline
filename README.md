# Task Timeline

A timeline-based task planner. Tasks are cards on a 48-hour timeline, grouped into color-coded tracks. Drag to move/resize them, link dependencies, add Markdown notes, plan to-dos, run a Pomodoro timer, and keep a daily log of what you finished.

Built with Vite + React. No real backend — the dev server writes state to a JSON file on disk. The Mac you run it on is the source of truth; a phone installs it as a PWA and syncs from there.

## What's in it

- **Timeline board** — 48h canvas anchored to today, horizontal or vertical. Live "now" line. Create cards by double-clicking, drag to move across time/tracks, drag the edge to resize. Marquee-select and move groups. Snaps to 10 minutes.
- **Tracks** — rename, recolor, reorder, add/delete, drop dividers between them.
- **Dependencies** — drag between card dots (or two-click). Back-to-back links show as a chain link.
- **Notes** — a detail panel per task with Markdown (GFM), code highlighting, checkbox to-dos, and pasted images.
- **To-do planner** — a nestable to-do tree. Schedule a to-do onto a timeline, group them under a root, and soft-delete with a 7-day recovery bin.
- **Pomodoro** — focus/break timer in the header, 25m focus with breaks.
- **Completed log** — finished tasks by day, with a summaries-only view to scroll through your days.
- **Backlog / Archive / Tags** — tasks that age off the canvas, deleted tracks, and a global tag pool.
- **Undo/redo, copy/paste.**
- **Installable PWA** — install on your phone, see the last synced board offline (read-only), with a sync status pill and a manual "sync now".

## Run it

Needs Node 18+.

```bash
npm install
npm run dev
```

That starts the dev server at `localhost:5173` with state saved to `data/state.json`.

Other scripts:

- `npm run build` — production build
- `npm run preview` — serve a build
- `npm run serve` — build + serve the production bundle on `:5173` (this is the one you install on your phone)

## Install on your phone

Phone and Mac need to be on the same Wi-Fi.

1. Run `npm run serve` and note the `Network:` URL it prints (e.g. `https://192.168.0.105:5173/`).
2. Open that URL on the phone in Chrome → menu → Add to Home screen.
3. Open it once while the Mac is awake so it caches. After that it opens offline (read-only) and syncs when the Mac is up.

## How it saves state

No backend. `vite.config.js` adds a small API to the dev/preview server:

- `/api/state` ↔ `data/state.json` — the whole board, revision-stamped so a stale device can't overwrite newer work. Backups kept in `data/backups/`.
- `/api/assets` ↔ `data/assets/` — pasted images, by content hash.
- Everything is also mirrored to `localStorage`, which is what the phone shows offline.

`data/` is git-ignored.

## Code

- `src/App.jsx` — one class component, holds all state and behavior.
- `src/components/` — the views (timeline, panels, pages).
- `src/lib/` — time/geometry/color helpers, storage, pomodoro, todos.
- `vite.config.js` — the dev/preview server + the state/asset API.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data model and internals, and [CLAUDE.md](CLAUDE.md) for setup/run notes if you're working on it with an AI agent.
