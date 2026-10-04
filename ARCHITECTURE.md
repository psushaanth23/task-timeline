# task-timeline — Architecture & Onboarding

> Orientation doc for a fresh Claude session (or any new contributor). The
> `README.md` describes the *original* prototype; this app has since grown
> well past it (tags, archive, notes, disk persistence, routing, undo, …). When
> the two disagree, **this file and the code win**. See "What the README misses"
> at the bottom.

## What it is

A single-user, front-end-only **timeline task planner**. Tasks are cards laid
out on a fixed **48-hour** timeline, grouped into color-coded **tracks**
(swimlanes). You drag cards to move/resize them, wire up dependencies between
them, tag tracks, attach Markdown notes, and archive tracks. It's a **Vite +
React 18** app (class component, no router, no Redux). Ported from a Salesforce
DesignComponent HTML prototype.

Run it:

```bash
npm install
npm run dev      # http://localhost:5173
```

## The big picture in 60 seconds

- **One giant class component** — `src/App.jsx` (~2750 lines) holds *all* state
  and *all* behavior. Everything else in `src/components/` is a mostly-dumb
  presentational component that receives props.
- **`computeVals()`** is the heart. `render()` calls it to turn raw state
  (tasks, tracks, drag/resize/marquee, zoom, orientation…) into a big flat
  **`vals`** object of precomputed inline styles, event handlers, and derived
  data. `vals` is spread into `<Header {...vals} />`, `<Timeline {...vals} />`,
  `<Sidebar {...vals} />`. So: **to understand what the timeline renders, read
  `computeVals()`; to understand how it renders, read `Timeline.jsx`.**
- **No CSS-in-files for layout** — almost all styling is inline styles built in
  `computeVals()`. `src/index.css` only holds global resets, fonts, keyframes
  (`pulseUrgent`, `nowPulse`, `panelSlideIn`), scrollbars, hover helpers, and
  `.md-body` markdown theme.

## The data model

State lives in `App` (`this.state`). The persisted, meaningful parts:

| Field | Shape | Meaning |
| --- | --- | --- |
| `tasks` | `[{ id, title, lane, start, duration, done, parentIds, notes, completedAt?, todoSnapshots? }]` | The task cards. |
| `tracks` | `[{ id, name, color, tagIds }]` | Swimlanes. A task's `lane` is an **index into this array**, not an id. |
| `tags` | `[{ id, label, color }]` | Global tag pool. Assigned to *tracks* (via `track.tagIds`), never directly to tasks. |
| `deletedTracks` | `[{ id, name, color, tagIds, tasks, deletedAt }]` | Soft-delete archive (see Archive). |
| `dividers` | `[{ id, afterTrackId }]` | Visual separators drawn after a given track's lane. |
| `backlog` | `[{ id, title, duration, done, notes, startMs, trackId, trackName, trackColor, backloggedAt }]` | Tasks that no longer fit the 48h canvas (see Backlog). **Absolute** (`startMs`), no `lane`. |
| `originMs` | epoch ms | **The pixel-0 anchor.** See "Time model". |

### Time model (read this before touching time/layout math)

- Pixel-0 of the time axis = `originMs` = **local midnight of TODAY**
  (`localMidnightMs()` in `lib/time.js`), re-derived on every load and on day
  rollover. It is deliberately **never restored from the saved blob** — the
  canvas is a fixed 48h window, so adopting an old saved origin parked the whole
  board on a past day (wrong dates in the date bar, no now-line, "Now" scrolling
  to a clamped edge). `resolveOrigin()` returns today; the blob's `origin` is
  read only as `savedOrigin()`, to place legacy tasks that lack `startMs`.
- A task's `start` and `duration` are **minute offsets from `originMs`** — so
  `start` can exceed 1440 (into day 2 of the 48h canvas). "Now" is
  `minutesSince(originMs)` (kept in `state.nowMin`, refreshed every 15s).
  Because everything is measured from the same fixed origin, nothing shifts when
  the wall clock crosses midnight.
- **Persist form differs from memory form.** On disk / in localStorage each task
  also carries an absolute `startMs = originMs + start*60000`. On load,
  `hydrateTasks()` re-derives `start` from `startMs` against the *current*
  origin. This makes saved files origin-independent (a real date+time round-trips).
  → `serializeTasks()` / `hydrateTasks()` are the boundary; also
  `serializeDeleted()` / `hydrateDeleted()` for archived tracks.
- `SNAP_MIN = 10` — starts/durations snap to a 10-minute grid.
- Layout constants live in `lib/constants.js` `LAYOUT` (`laneSize`, `dateBarH`,
  `hourBarH`, `trackHeaderH`, `totalMin: 2880`).

### Backlog (#96) — where off-canvas tasks go

The board only renders `[origin, origin + totalMin)`. Anything scheduled for an
earlier day (or past the far edge) has no pixel to live on, so it is swept into
`state.backlog` instead of silently vanishing:

- `isOffCanvas(task)` → ends at/ before pixel 0, or starts past `totalMin`.
- `partitionOffCanvas()` splits hydrated tasks into board + backlog entries and
  prunes dangling `parentIds` on the survivors.
- `toBacklogEntry()` converts a board task to the absolute backlog shape — it
  drops `lane` (positional, would rot) and keeps `trackId` + a name/color copy.
- The sweep runs from `adoptSaved()` (every load) and `reanchorToToday()` (the
  15s `tickNow()` guard, which fires once now leaves the window). Both are
  clock-driven migrations and are deliberately **not** routed through
  `persist()` — they must not land on the undo stack — but they do write both
  caches. `hydrateFromDisk` re-saves immediately when a migration happened.
- `#/backlog` (`BacklogPage.jsx`) groups entries by scheduled day and offers
  restore-one / restore-all (placed at the next 10-min slot at/after now, in the
  original track when it still exists) and drop/clear. `sendToBacklog()` from the
  detail panel defers a live task by hand.
- Backlog entries are already absolute, so they persist **as-is** — no
  serialize/hydrate transform, only `hydrateBacklog()` validation.

### Orientation

The board renders **horizontal** (time → right, tracks stacked down) or
**vertical** (time → down, tracks as columns). Two helpers gate almost all the
geometry branching:

- `timeDensity()` — px per minute. Horizontal uses the adjustable `zoom`
  (1–12); vertical uses a fixed `VERTICAL_PX = 5`.
- `laneCross()` — the track's cross-axis size. Horizontal uses fixed
  `LAYOUT.laneSize`; vertical uses the adjustable `trackWidth` (90–320).

Throughout the code, `const V = orientation === 'vertical'` toggles which axis is
time and which is tracks. **When editing layout, always handle both `V` branches.**

## Persistence (two-tier: disk is source of truth, localStorage is a cache)

There is *no real backend*. Instead `vite.config.js` registers a **dev-server
middleware plugin** that exposes a tiny JSON API and writes to disk under
`data/` (which is git-ignored):

- `GET/PUT/POST /api/state` ↔ `data/state.json` — the whole app state blob.
  Client: `src/lib/remoteStore.js` (`loadState` / `saveState`).
- `POST /api/assets` + `GET /api/assets/<hash>.<ext>` ↔ `data/assets/` —
  content-hashed image store for pasted images in notes. Client:
  `src/lib/assets.js` (`uploadImage`). Only the short URL is stored in state,
  never the bytes.
- `src/lib/storage.js` — the **localStorage** cache (`loadData`/`saveData`,
  `loadView`/`saveView`), keyed `timeline-todo-v2` and `timeline-todo-view`.

Flow (see `componentDidMount` → `hydrateFromDisk`):

1. Synchronously paint from localStorage (fast) + seed data.
2. Async load disk. **Disk wins** unless the user already edited during the load
   window (`_dirtyBeforeHydration`), then mirror disk → localStorage.
3. All mutations go through **`persist()`**, which: pushes an undo snapshot,
   writes localStorage immediately, `setState`s, and schedules a **debounced
   (350ms) disk write** via `syncDisk()`. `flushDiskSave()` runs on unload.
4. `_hydrated` gates disk writes so an in-flight load can't clobber edits.

> **Because it relies on the Vite dev-server middleware, disk persistence only
> works under `npm run dev`.** A plain static `npm run build` has no `/api`, so
> it silently falls back to localStorage only.

## The one rule for mutations: `persist()`

Almost every state change funnels through **`persist(tasks?, tracks?, tags?,
deleted?, dividers?)`** (pass `null` to keep a slice unchanged). It gives you
undo/redo + localStorage + debounced disk save for free. `undo()`/`redo()`
snapshot the same five slices. If you add a new persisted slice, thread it
through `persist`, `undo`, `redo`, `saveLocal`, `diskPayload`, and the
serialize/hydrate helpers. (`backlog` is the most recent example — follow it as
the template.) `undo`/`redo` snapshot via `snapshot()`.

## Interaction system (all in App.jsx)

The board uses a shared, content-coordinate-based pointer system. Key entry
points and the `state` slice each drives:

- **`onBoardMouseDown` → marquee** (`state.marquee`) — rubber-band select on
  empty space; a clean click clears selection.
- **`onCardMouseDown` → single drag** (`state.drag`) or **group drag**
  (`state.groupDrag`, when the card is already in the selection; group moves are
  time-axis only).
- **`startResize` → resize** (`state.resize`) — drag trailing edge/corner.
- **`startWire` → dependency wiring** (`state.wiring` for drag-to-connect;
  `state.pendingConnect` for the two-click connect gesture). Releasing on
  another card's dot makes it a child. `connectDep`/`deleteDependency` edit
  `parentIds`.
- **`startTrackDrag` → reorder tracks** (`state.trackDrag`); remaps every task's
  `lane` by track id afterward.
- Movement is dispatched by `dispatchMove` → `updateSingleDrag`/`updateGroupDrag`
  /`updateResize`/`updateMarquee`; `onBoardPointerUp` → the matching `finish*`.
- **Edge auto-scroll** during any drag: `lib/autoscroll.js` `EdgeAutoScroller`.
- **Keyboard** (`onDocKeyDown`): Cmd/Ctrl+Z / +Shift+Z / +Y undo/redo, Cmd/Ctrl+C
  /+V copy/paste tasks (in-app `_clipboard`), Delete/Backspace delete selection,
  Escape cancels a pending connect or closes the panel.
- **Click semantics on a card** (in the taskView `onClick`): 1 click = select,
  2 = inline rename, 3 = toggle done. Double-click empty space = create task.

## Routing (hash-based, no library)

`App.parseHash()` maps the URL hash to a `route`:

- `#/archive` → `<ArchivePage>` (deleted tracks; restore/purge; read-only notes)
- `#/backlog` → `<BacklogPage>` (off-canvas tasks; restore to now / drop)
- `#/tags` → `<TagManagerPage>` (rename/recolor/delete tags globally)
- `#/tag/<id>` → `<TagTasksPage>` (all tasks whose track carries that tag)
- anything else → the timeline

`render()` early-returns one of those pages before the main timeline. `go*()`
methods set the hash; `onHashChange` keeps `state.route` in sync.

## Component map (`src/components/`)

| File | Role |
| --- | --- |
| `Header.jsx` | Top bar: brand, orientation/sidebar toggles, jump-to-now, zoom bar host, archive/tags links, `HelpPanel` trigger. |
| `ZoomBar.jsx` | Density (horizontal) or track-width (vertical) slider + −/+. |
| `Sidebar.jsx` | **Vertical mode only** time-ruler column (horizontal track labels live in Timeline's sticky gutter). |
| `Timeline.jsx` | The board: ruler, lanes, grid, task cards, connectors, chain links, now-line, marquee, dividers, hover-cards. Big, but presentational. |
| `SelectionBox.jsx` | Marquee rectangle. |
| `ChainLink.jsx` | Chain-link glyph for back-to-back (adjacent, same-track) dependencies. |
| `TrackName.jsx` | Inline-editable (contentEditable) track name. |
| `TrackTags.jsx` / `TagChip.jsx` / `TagPicker.jsx` | Per-track tag chips + the add/assign popover. |
| `DetailPanel.jsx` | Right-docked, resizable task detail panel (opened via a card's notes icon). |
| `MarkdownNotes.jsx` | Markdown notes editor + `MarkdownView` renderer (react-markdown + remark-gfm + rehype-highlight; **raw HTML intentionally disabled — safe by default**). Supports interactive GFM checkbox to-dos and pasted-image upload. |
| `HelpPanel.jsx` | "How to use" modal listing every gesture/shortcut. |
| `ArchivePage.jsx` | Deleted-tracks page. |
| `BacklogPage.jsx` | Backlog page: tasks that aged off the 48h canvas, grouped by their scheduled day, with restore-to-now / drop. |
| `TagManagerPage.jsx` | Global tag manager page. |
| `TagTasksPage.jsx` | Tasks-by-tag page. |

## `src/lib/`

| File | Role |
| --- | --- |
| `constants.js` | `PALETTE` (append-only — colors are persisted!), `LAYOUT`, id generators, `makeTracks`/`seedTasks`. |
| `time.js` | Time origin + formatting/parsing (`localMidnightMs`, `minutesSince`, `fmt`, `fmtHour`, `fmtHM`, `fmtDateTime`, `durLabel`, `MS_PER_MIN`). |
| `color.js` | `hexToRgba`. |
| `geometry.js` | `bezier` path builder for dependency connectors. |
| `autoscroll.js` | `EdgeAutoScroller` for drag-near-edge scrolling. |
| `storage.js` | localStorage cache. |
| `remoteStore.js` | `/api/state` disk client. |
| `assets.js` | `/api/assets` image-upload client. |

## Conventions & gotchas

- **`PALETTE` in `constants.js` is append-only.** Track/tag colors are stored as
  literal hex; reordering breaks existing saved state.
- **`task.lane` is an index, not a track id.** Any op that adds/removes/reorders
  tracks must remap lanes (see `deleteTrack`, `onTrackDragUp`, `restoreTrack`).
- **Feature history is encoded in commit messages** as numbered increments
  (`#71`…`#95`); many inline comments reference those numbers. `git log --oneline`
  is a good changelog.
- **Handle both orientations** (`V` branches) whenever you touch geometry.
- **Route all mutations through `persist()`** unless you deliberately want to
  skip undo/persistence (rare — e.g. transient drag state uses bare `setState`).
- **View prefs vs data** persist separately: `persistView()` for
  orientation/zoom/sidebar/panel widths; `persist()` for tasks/tracks/tags/etc.

## What the README misses (added since it was written)

The README documents the base prototype. These later features are **not** in it
but are in the code today: global **tags** + tag manager + tasks-by-tag view;
soft-delete **archive** of tracks; lane **dividers**; the right-docked
**detail panel** with **Markdown notes** (GFM, code highlighting, interactive
to-do checkboxes, pasted-image upload); the **backlog** for tasks that age off
the 48h canvas (plus the origin always re-anchoring to today); **on-disk persistence** via the
Vite dev-server API (`data/state.json` + `data/assets/`); hash **routing**;
**undo/redo**; task **copy/paste**; **"pull missed/overdue tasks to now"**
per-track buttons; `completedAt` timestamps; the **two-click connect** gesture
(alongside drag-to-connect); the glass **hover-card** tooltip; and the 10-minute
ruler ticks/grid. Treat the README as historical; verify against the code.

## Added most recently (post-#95)

The README has since been rewritten to cover these, but noting them here too:

- **To-do planner** (`TodoPanel.jsx`, `lib/todos.js`): a nestable to-do tree in a
  side panel. A level-0 item with children is a **group root**. `addTodoToTrack`
  turns a to-do into a board task (`todo.taskId` links them). A group root can be
  assigned to a timeline; children then one-click **+** onto that track (long-press
  to pick another). **Soft delete**: `removeTodo` stamps `deletedAt` instead of
  dropping the row (keeps array length so the regression guard doesn't trip);
  `restoreTodo` clears it; `purgeDeletedTodos` drops items > 7 days deleted. A
  "deleted" bin in the panel restores them. `hydrateTodos` must preserve
  `deletedAt`.
- **Pomodoro** (`PomodoroPanel.jsx`, `lib/pomodoro.js`): Focus 25m → Short → Long
  (long after every 4 focus sessions). Header timer pill + a phase-colored glow
  gradient behind it. Can bind a task to focus on.
- **Completed page** (`CompletedPage.jsx`): dated log of finished tasks with
  per-day summaries and a "Summaries only" collapse toggle.
- **PWA + offline + sync** — the big one. The app installs on a phone and runs
  offline:
  - `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`; registered in
    `main.jsx`; PWA meta in `index.html`.
  - `vite.config.js` serves **HTTPS** (`devHttps()` reads `certs/dev-*.pem`) on both
    the dev server and `vite preview`, and mounts the `/api/state` + `/api/assets`
    middleware on **both** (`configureServer` + `configurePreviewServer`) via a
    shared `makeStateMiddleware(root)` — so the installed production bundle still
    syncs. `npm run serve` = build + preview.
  - **Sync status**: `App.state.syncState` ('online'|'syncing'|'offline') +
    `lastSyncAt`, driven by `markSync()` from `writeDisk`/`pollDisk`/`syncNow`.
    Surfaced as a header pill (`SyncPill` in `Header.jsx`) with a manual **Sync
    now** (`syncNow()`).
  - **View-only offline**: `isReadOnly()` (true when `syncState==='offline'`)
    short-circuits `persist`/`undo`/`redo` and flashes `readOnlyNudge`; an offline
    banner renders under the header. The Mac stays source of truth, so a stale
    phone copy can't clobber it. On reconnect `pollDisk` clears `_diskUnavailable`
    and adopts disk.
- **Data-loss guards** (server side, `vite.config.js`): rotating timestamped
  backups under `data/backups/` (keep 100), and a `wouldRegress`/`regressesDisk`
  check that refuses a no-baseRev forced beacon write which would drop
  tasks/todos/backlog or flip done→undone.
