# CLAUDE.md — working in this repo

Guidance for an AI agent (Claude) contributing to **task-timeline**. Read this first, then [ARCHITECTURE.md](ARCHITECTURE.md) for the deep dive on the data model and internals.

## Project Name: task-timeline

## What it is

A single-user timeline task planner: tasks are cards on a fixed 48-hour canvas, grouped into color-coded tracks. Vite + React 18, **one big class component** (`src/App.jsx`) holding all state and behavior; everything in `src/components/` is mostly-presentational and receives props. No router (hash-based routing), no Redux.

## Setup & run

```bash
npm install
npm run dev        # dev server + /api/state persistence API (your working server)
```

| Script | Use |
| --- | --- |
| `npm run dev` | Day-to-day dev with HMR and on-disk persistence. |
| `npm run build` | Production build to `dist/`. **This is the verification step** (see below). |
| `npm run preview` | Serve a built `dist/`. |
| `npm run serve` | Build + serve the production bundle on `:5173` — the installable PWA; also serves `/api/state`. |

Node 18+ (developed on Node 24).

## Verifying a change

- **Always run `npm run build` after edits** and make sure it passes before reporting done. There is no test suite; the build (which type-checks nothing but catches all syntax/import errors and bundles every module) is the gate.
- If you touched the dev/preview server or the API, start the relevant server briefly and probe the endpoint (`curl -sk https://localhost:<port>/api/state`) to confirm it still responds.
- Report outcomes plainly: if the build fails, say so with the error.

## Conventions that matter

- **Route all board mutations through `persist()`** (`App.jsx`). It gives undo/redo + localStorage + debounced disk save. If you add a persisted slice, thread it through `persist`, `undo`, `redo`, `saveLocal`, `diskPayload`, and the serialize/hydrate helpers. Clock-driven migrations (midnight re-anchor, backlog sweep) deliberately bypass `persist()` so they don't land on the undo stack.
- **`task.lane` is an index into `tracks`, not a track id.** Any track add/remove/reorder must remap lanes.
- **`PALETTE` in `lib/constants.js` is append-only** — colors are persisted as literal hex; reordering corrupts saved state.
- **Handle both orientations.** `const V = orientation === 'vertical'` gates most geometry; cover both branches when editing layout.
- **View prefs vs data persist separately:** `persistView()` for orientation/zoom/sidebar/panel widths; `persist()` for tasks/tracks/tags/todos/backlog/dividers.
- Match the surrounding style — these files favor dense inline-style objects built in `computeVals()` and explanatory comments that reference feature increments (`#71`…).

## Persistence & offline (don't break these)

- Disk is the source of truth (`data/state.json`, revision-stamped); localStorage is a fast-paint cache **and** the offline view. The server refuses stale-revision writes (409) and keeps rotating backups under `data/backups/` — this is the data-loss guard; don't weaken it.
- The service worker (`public/sw.js`) **bypasses `/api/`** so task data is never served stale. It caches only the app shell/assets.
- Offline, the app is **view-only**: `isReadOnly()` (true when `syncState === 'offline'`) short-circuits `persist`/`undo`/`redo` so a stale phone copy can't clobber the Mac. Keep that guarantee.

## Secrets / never commit

`data/` (real tasks, backups) and `certs/` (TLS keys) are git-ignored and must stay out of version control. Don't commit anything under them, and don't print their contents into committed files.

## Git

Remote: `origin` → `https://github.com/psushaanth23/task-timeline`. Commit/push only when the user asks. The user runs the dev server themselves — don't assume a free port.
