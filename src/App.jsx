import React from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Timeline from './components/Timeline.jsx';
import { isNarrowNow, onNarrowChange, isCoarsePointer } from './lib/responsive.js';
import { installTouchDrag } from './lib/touchDrag.js';
import { PALETTE, LAYOUT, DAYS_BEFORE, WINDOW_DAYS, MINUTES_PER_DAY, genTrackId, genTagId, makeTracks, seedTasks, isBreakTrack } from './lib/constants.js';
import TagPicker from './components/TagPicker.jsx';
import ArchivePage from './components/ArchivePage.jsx';
import BacklogPage from './components/BacklogPage.jsx';
import TagManagerPage from './components/TagManagerPage.jsx';
import TagTasksPage from './components/TagTasksPage.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import BacklogPanel from './components/BacklogPanel.jsx';
import PomodoroPanel from './components/PomodoroPanel.jsx';
import {
  PHASES,
  DEFAULT_CONFIG,
  phaseLengthMin,
  nextPhase,
  dayKey,
  loadPomodoro,
  savePomodoro,
  mmss,
  playChime,
  notify as pomoNotify,
} from './lib/pomodoro.js';
import CompletedPage from './components/CompletedPage.jsx';
import TodoPanel from './components/TodoPanel.jsx';
import { hydrateTodos, genTodoId, childrenOf, subtreeIds, depthOf, MAX_TODO_DEPTH, TODO_MINUTES } from './lib/todos.js';
import ConfirmDeleteTrack from './components/ConfirmDeleteTrack.jsx';
import { fmt, fmtHour, fmtHM, fmtDateTime, durLabel, MS_PER_MIN, localMidnightMs, localMidnightDaysAgoMs, minutesSince } from './lib/time.js';
import { hexToRgba } from './lib/color.js';
import { bezier } from './lib/geometry.js';
import { loadData, saveData, loadView, saveView } from './lib/storage.js';
import { loadState, saveState, saveStateBeacon } from './lib/remoteStore.js';
import { EdgeAutoScroller } from './lib/autoscroll.js';

// Horizontal mode: slider controls time density (pixels per minute).
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;
const ZOOM_STEP = 0.5;
// Vertical mode: slider controls the track-column width (pixels) instead,
// while the time axis keeps a fixed density. This is roomy on purpose so short
// or adjacent tasks (and their labels) don't overlap — vertical mode has no
// density slider, so the scale must give each task enough vertical room.
const TRACKW_MIN = 90;
const TRACKW_MAX = 320;
const TRACKW_STEP = 10;
const TRACKW_DEFAULT = 150;
const VERTICAL_PX = 5;
// Snap grid for task start/end (minutes). Offsets are measured from the fixed
// absolute origin (#37), so snapping to multiples of SNAP_MIN keeps both the
// start and the end on the 10-minute grid and works naturally across midnight.
const SNAP_MIN = 10;
// Max task start offset within the canvas (LAYOUT.totalMin), kept on the snap grid.
const MAX_START = LAYOUT.totalMin - SNAP_MIN;
// Below this on-screen card length (px, horizontal mode) the in-card title is
// too cramped to read, so we hide it and render the name just outside the card.
const NARROW_CARD_PX = 90;
// Pointer travel (px) past which a dot press counts as a drag-to-connect rather
// than a clean click that arms/completes the two-click connect.
const WIRE_DRAG_THRESHOLD = 4;

export default class App extends React.Component {
  constructor(props) {
    super(props);
    this.contentRef = React.createRef();
    this.scrollRef = React.createRef();
    this.boardRef = React.createRef();
    this.palette = PALETTE;
    // The timeline's pixel-0 is a fixed, absolute moment: local midnight
    // DAYS_BEFORE days ago, so the canvas reaches into the past (today sits
    // DAYS_BEFORE days in). Task `start` is a minute offset from this origin, so
    // a task maps to a real date+time and never shifts when the wall clock
    // crosses midnight. Persisted/migrated in componentDidMount / hydrateFromDisk.
    const originMs = localMidnightDaysAgoMs(DAYS_BEFORE);
    // Rehydrate the persisted Pomodoro engine snapshot. If it was running, the
    // remaining time is derived from the absolute endsAt so a reload continues
    // the countdown accurately; otherwise fall back to the frozen remainingMs or
    // a fresh phase length.
    const pomoSaved = loadPomodoro() || {};
    const pomoCfg = pomoSaved.config || DEFAULT_CONFIG;
    const pomoPhase = pomoSaved.phase || 'focus';
    const pomoInitialRemaining =
      pomoSaved.running && pomoSaved.endsAt
        ? Math.max(0, pomoSaved.endsAt - Date.now())
        : typeof pomoSaved.remainingMs === 'number'
          ? pomoSaved.remainingMs
          : phaseLengthMin(pomoCfg, pomoPhase) * 60000;
    this.state = {
      tasks: seedTasks(),
      tracks: makeTracks(),
      originMs,
      nowMin: minutesSince(originMs),
      editingId: null,
      drag: null,
      groupDrag: null,
      resize: null,
      marquee: null,
      selection: [],
      trackDrag: null,
      editingTrack: null,
      // Global tag collection { id, label, color }; per-track assignment lives
      // on track.tagIds. tagPicker holds the open popover's { trackIndex, rect }.
      tags: [],
      tagPicker: null,
      // Soft-delete archive: deleted tracks are moved here (with their tasks,
      // tagIds and a deletedAt stamp) instead of being destroyed, and are
      // viewable/restorable from the #/archive page.
      deletedTracks: [],
      // #96: tasks that no longer fit the 48h canvas (scheduled for an earlier
      // day, or past its far edge). Entries keep an ABSOLUTE `startMs` plus the
      // track they came from, and live on the #/backlog page until restored or
      // dropped. Populated on load and on day rollover.
      backlog: [],
      // To-do list (right-docked panel): a tree of { id, title, notes, parentId,
      // done, taskId }. taskId links a to-do to the board task it was added as,
      // so ticking either side syncs and deleting the card frees the to-do.
      todos: [],
      todoPanelOpen: false,
      // Id of a freshly created to-do: the panel puts the caret in it.
      todoDraftId: null,
      // Sync-to-Mac connection state for the header indicator (the Mac is the
      // source of truth; this device just syncs). 'syncing' while a request is
      // in flight, 'online' after a success, 'offline' after a failed reach.
      // lastSyncAt = epoch ms of the last successful round-trip.
      syncState: 'online',
      lastSyncAt: Date.now(),
      // Flashes a "read-only while offline" hint when an edit is blocked because
      // the Mac (source of truth) is unreachable.
      readOnlyNudge: false,
      route: App.routeFromHash(),
      routeTagId: App.parseHash().tagId,
      wiring: null,
      pendingConnect: null,
      // Visual separators between adjacent lanes. Each is { id, afterTrackId }
      // ("sits after the lane whose track id is afterTrackId"), so it survives
      // reorder/rename; anchors to removed/archived tracks are dropped on load.
      dividers: [],
      // Id of the task whose detail panel (Markdown notes) is open, or null.
      panelTaskId: null,
      // Track id whose per-track backlog panel is open (right-docked), or null.
      // Mutually exclusive with the task detail panel.
      backlogTrackId: null,
      // Track id awaiting delete confirmation (it still has pending work), or null.
      confirmDeleteTrackId: null,
      // Backlog entry id hovered in that panel: the board draws a ghost where it lands.
      backlogHoverId: null,
      // Width (px) of the right-docked detail panel; user-resizable + persisted.
      panelWidth: 410,
      panelResizing: null,
      // Pomodoro timer: whether the right-docked panel is open, and the id of the
      // board task the current session is bound to (it pulses on the board and
      // gets a 🍅 log line per finished focus). The timer's own run-state lives
      // inside PomodoroPanel (localStorage), independent of the board's undo/redo.
      pomodoroOpen: false,
      focusTaskId: pomoSaved.focusTaskId || null,
      // Pomodoro engine state. Lifted OUT of PomodoroPanel so the timer keeps
      // running (and stays visible via the floating board chip) even when the
      // panel is closed. endsAt (epoch ms) is the source of truth while running;
      // when paused we hold the frozen remainingMs. Driven by a 250ms tick in
      // componentDidMount so drift/tab-throttle can't accumulate.
      pomo: {
        config: pomoSaved.config || DEFAULT_CONFIG,
        phase: pomoSaved.phase || 'focus',
        running: pomoSaved.running || false,
        completedFocus: pomoSaved.completedFocus || 0,
        endsAt: pomoSaved.running ? pomoSaved.endsAt || null : null,
        remainingMs: pomoInitialRemaining,
        tally:
          pomoSaved.tally && pomoSaved.tally.day === dayKey()
            ? pomoSaved.tally
            : { day: dayKey(), count: 0 },
      },
      // Scroll-aware date indicator: a floating pill shows which day you're
      // currently scrolled to. It fades in while scrolling and out shortly after
      // you stop. `scrolledDayLabel` is the formatted "Wed · Sep 17"; visible
      // gates the fade.
      scrolledDayLabel: '',
      scrollPillVisible: false,
      orientation: 'horizontal',
      sidebarWidth: 150,
      sidebarCollapsed: false,
      // Phone widths get a touch handle for the track-label gutter (#mobile).
      narrow: isNarrowNow(),
      // Horizontal mode: the left track-name gutter auto-collapses while the
      // user scrolls the board to the RIGHT (revealing more timeline) and
      // reappears on any leftward scroll. Transient / not persisted — it is a
      // scroll gesture, not a saved preference like `sidebarCollapsed`.
      labelsAutoHidden: false,
      sidebarResizing: null,
      zoom: props.zoom ?? 4,
      trackWidth: TRACKW_DEFAULT,
    };
    this.onBoardDblClick = this.onBoardDblClick.bind(this);
    this.onBoardMouseDown = this.onBoardMouseDown.bind(this);
    this.onBoardPointerMove = this.onBoardPointerMove.bind(this);
    this.onBoardPointerUp = this.onBoardPointerUp.bind(this);
    this.onTrackDragMove = this.onTrackDragMove.bind(this);
    this.onTrackDragUp = this.onTrackDragUp.bind(this);
    this.onWireMove = this.onWireMove.bind(this);
    this.onWireUp = this.onWireUp.bind(this);
    this.onPendingMove = this.onPendingMove.bind(this);
    this.onSidebarResizeMove = this.onSidebarResizeMove.bind(this);
    this.onSidebarResizeUp = this.onSidebarResizeUp.bind(this);
    this.onPanelResizeMove = this.onPanelResizeMove.bind(this);
    this.onPanelResizeUp = this.onPanelResizeUp.bind(this);
    this.scroller = new EdgeAutoScroller({
      getElement: () => this.scrollRef.current,
      getVertical: () => this.state.orientation === 'vertical',
      onTick: (x, y) => this.onScrollTick(x, y),
    });
    this.undoStack = [];
    this.redoStack = [];
    // In-app clipboard for task copy/paste (Ctrl/Cmd+C / +V). Holds field
    // templates (no ids) so repeated paste keeps minting fresh duplicates.
    this._clipboard = [];
    // Disk-persistence state: disk is the source of truth, localStorage is a
    // fast-paint cache + offline fallback. `_hydrated` gates disk writes until
    // the async disk load resolves; `_dirtyBeforeHydration` records whether the
    // user edited during that window so we don't clobber their changes.
    this._hydrated = false;
    this._dirtyBeforeHydration = false;
    // Revision of the on-disk state this client last saw. Sent with every write
    // so the server can refuse a save built on a stale snapshot (see
    // lib/remoteStore.js) — that refusal is what stops one device from wiping
    // out tasks another device just added.
    this._rev = null;
    // When the user last changed something HERE. A recent local edit wins a
    // conflict; an idle client yields to whatever the other device saved.
    this._lastEditAt = 0;
    this._saveInFlight = false;
    this._saveAgain = false;
    this._diskTimer = null;
    this.onDocKeyDown = this.onDocKeyDown.bind(this);
    this.onHashChange = this.onHashChange.bind(this);
  }

  // Time density (px per minute) for the current orientation. Vertical mode
  // keeps a fixed compact scale; horizontal mode uses the adjustable zoom.
  timeDensity() {
    return this.state.orientation === 'vertical' ? VERTICAL_PX : this.state.zoom;
  }

  // Scroll-aware date indicator. On each (rAF-throttled) scroll we work out which
  // day sits at the near edge of the viewport and surface it in a floating pill.
  // Mirrors jumpToNow's axis handling: horizontal scrolls scrollRef.scrollLeft;
  // vertical scrolls whichever of scrollRef/boardRef actually overflows, offset
  // by the sticky header (barSize) so the day matches what's on screen.
  onBoardScroll = () => {
    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = null;
      const px = this.timeDensity();
      if (!px) return;
      const V = this.state.orientation === 'vertical';
      let offset = 0;
      if (V) {
        const barSize = LAYOUT.trackHeaderH;
        const el = [this.scrollRef.current, this.boardRef.current].find(
          (e) => e && e.scrollHeight > e.clientHeight + 1,
        );
        if (!el) return;
        offset = Math.max(0, el.scrollTop - barSize);
      } else {
        const sc = this.scrollRef.current;
        if (!sc) return;
        offset = sc.scrollLeft;
        // Auto-hide the left track-name gutter based on horizontal scroll
        // direction: scrolling RIGHT (toward more timeline) collapses it so the
        // board gets the full width; scrolling LEFT brings the names back. A
        // small deadzone avoids flicker, and near the far-left we always show
        // the names (there's nothing to gain by hiding at the start).
        const prev = this._lastScrollLeft ?? offset;
        const delta = offset - prev;
        if (Math.abs(delta) > 4) {
          this._lastScrollLeft = offset;
          const hide = delta > 0 && offset > 24;
          if (hide !== this.state.labelsAutoHidden) {
            this.setState({ labelsAutoHidden: hide });
          }
        }
        if (offset <= 4 && this.state.labelsAutoHidden) {
          this._lastScrollLeft = offset;
          this.setState({ labelsAutoHidden: false });
        }
      }
      const minutes = offset / px;
      const dayIdx = Math.max(0, Math.min(WINDOW_DAYS - 1, Math.floor(minutes / MINUTES_PER_DAY)));
      const dt = new Date(this.state.originMs);
      dt.setDate(dt.getDate() + dayIdx);
      const label = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      this.setState((s) =>
        s.scrolledDayLabel === label && s.scrollPillVisible
          ? null
          : { scrolledDayLabel: label, scrollPillVisible: true },
      );
      clearTimeout(this._scrollPillTimer);
      this._scrollPillTimer = setTimeout(() => {
        this.setState({ scrollPillVisible: false });
      }, 1100);
    });
  };

  // Auto-close the open right-docked panel (Pomodoro / backlog / task detail)
  // when the user clicks anywhere outside it — the timeline, the header, another
  // control, etc. Clicks INSIDE a panel ([data-task-panel]) are ignored, and so
  // are clicks on a panel's own toggle opener ([data-panel-opener]) so that
  // re-clicking the opener doesn't fire both this close AND the opener's toggle
  // (which would cancel out). Nothing open => no-op.
  onDocPointerDown = (e) => {
    const { pomodoroOpen, backlogTrackId, panelTaskId } = this.state;
    if (!pomodoroOpen && !backlogTrackId && !panelTaskId) return;
    const t = e.target;
    if (t && t.closest && (t.closest('[data-task-panel]') || t.closest('[data-panel-opener]'))) return;
    if (pomodoroOpen) this.setState({ pomodoroOpen: false });
    if (backlogTrackId) this.closeBacklogPanel();
    if (panelTaskId) this.closePanel();
  };

  // Cross-axis size of a track (row height in horizontal, column width in
  // vertical). Vertical mode uses the adjustable trackWidth.
  laneCross() {
    return this.state.orientation === 'vertical' ? this.state.trackWidth : LAYOUT.laneSize;
  }

  // #96: the timeline origin is ALWAYS derived from today — it is never restored
  // from the saved blob. Pixel-0 is local midnight DAYS_BEFORE days ago, so the
  // fixed WINDOW_DAYS-day canvas spans [today - DAYS_BEFORE, today + DAYS_AFTER]
  // and today (with "now") always sits inside it. Adopting a stale saved origin
  // (from whenever the file was last written) would park the board on an old day:
  // the date bar would read the wrong dates, the now-line would fall outside
  // [0, totalMin] and never render, and "Now" would scroll to a clamped edge.
  // Re-deriving from today on every load/rollover keeps "now" inside the window
  // by construction. The saved `origin` is still read — as `legacyOrigin` — but
  // only to place pre-#37 tasks that have no absolute `startMs`.
  resolveOrigin() {
    return localMidnightDaysAgoMs(DAYS_BEFORE);
  }

  // The origin a saved blob's minute offsets were measured against. Only used
  // as the base for legacy tasks lacking `startMs`; tasks with `startMs` are
  // absolute and re-derive against whatever the current origin is.
  savedOrigin(saved) {
    return saved && typeof saved.origin === 'number' ? saved.origin : localMidnightMs();
  }

  // Ensure every track has an id and a tagIds array (migration for older saved
  // state that predates tags).
  normalizeTracks(rawTracks, fallback) {
    let tr = rawTracks && rawTracks.length ? rawTracks : fallback;
    return tr.map((t) => ({
      ...(t.id ? t : { ...t, id: genTrackId() }),
      tagIds: Array.isArray(t.tagIds) ? t.tagIds : [],
    }));
  }

  // Tags default to [] so state saved before this feature still loads.
  normalizeTags(saved) {
    return saved && Array.isArray(saved.tags) ? saved.tags : [];
  }

  // Deleted-tracks archive. Persist form stores each archived track's tasks in
  // the absolute (startMs) form, mirroring active tasks, so restore keeps the
  // exact date+time regardless of the origin at reload. Defaults to [] so
  // pre-archive saved state still loads.
  serializeDeleted(deletedTracks, originMs) {
    return (deletedTracks || []).map((d) => ({
      ...d,
      tasks: this.serializeTasks(d.tasks || [], originMs),
    }));
  }

  hydrateDeleted(rawDeleted, originMs, legacyOriginMs) {
    if (!Array.isArray(rawDeleted)) return [];
    return rawDeleted.map((d) => ({
      id: d.id || genTrackId(),
      name: d.name || 'Untitled',
      color: d.color || PALETTE[0],
      tagIds: Array.isArray(d.tagIds) ? d.tagIds : [],
      deletedAt: typeof d.deletedAt === 'number' ? d.deletedAt : Date.now(),
      tasks: this.hydrateTasks(d.tasks || [], originMs, legacyOriginMs),
    }));
  }

  // Persist form: each task carries an absolute `startMs` so the file is
  // origin-independent and round-trips a real date+time.
  serializeTasks(tasks, originMs) {
    return tasks.map((t) => ({ ...t, startMs: originMs + Math.round(t.start) * MS_PER_MIN }));
  }

  // Rebuild in-memory tasks (minute offset from origin) from persisted tasks,
  // deriving `start` from the absolute `startMs` when present (new format) and
  // falling back to the raw `start` for legacy data. Also normalizes done/deps.
  hydrateTasks(rawTasks, originMs, legacyOriginMs) {
    // Legacy tasks (no absolute startMs) had their offsets measured against the
    // origin stored in the same blob, so shift them by that origin's delta.
    const legacyShift =
      typeof legacyOriginMs === 'number' ? (legacyOriginMs - originMs) / MS_PER_MIN : 0;
    return rawTasks.map((t) => {
      const parentIds = Array.isArray(t.parentIds) ? t.parentIds : t.parentId ? [t.parentId] : [];
      const start =
        typeof t.startMs === 'number'
          ? Math.round((t.startMs - originMs) / MS_PER_MIN)
          : Math.round((t.start || 0) + legacyShift);
      // Migration: tasks saved before the notes feature default to "".
      const notes = typeof t.notes === 'string' ? t.notes : '';
      const out = { ...t, start, done: !!t.done, parentIds, notes };
      delete out.startMs;
      return out;
    });
  }

  // ---------------------------------------------------------------------------
  // #96: Backlog — tasks that fell off the 48h canvas.
  //
  // The board only ever shows [origin, origin + totalMin). Once the origin is
  // re-anchored to today, everything scheduled for an earlier day (or further
  // out than the window reaches) has no pixel to live on. Rather than silently
  // hiding it (the old behavior, which is what made the board look "stuck on an
  // old date"), such a task is moved into the backlog: a persisted list, shown
  // on #/backlog, from which it can be pulled back onto today or dropped.
  //
  // A backlog entry keeps its ABSOLUTE time (`startMs`) plus enough track info
  // to be restorable, so it is origin-independent and needs no serialize step.
  // ---------------------------------------------------------------------------

  // Is this task entirely outside the current canvas? (ended before pixel 0, or
  // starts past the far edge). Tasks straddling either edge stay on the board.
  isOffCanvas(task) {
    const start = task.start || 0;
    const end = start + (task.duration || 0);
    return end <= 0 || start >= LAYOUT.totalMin;
  }

  // Split hydrated tasks into what stays on the board and what becomes backlog
  // entries. Dangling dependency refs to moved tasks are pruned from survivors.
  partitionOffCanvas(tasks, tracks, originMs) {
    const kept = [];
    const moved = [];
    tasks.forEach((t) => (this.isOffCanvas(t) ? moved.push(t) : kept.push(t)));
    if (!moved.length) return { tasks, moved: [] };
    const movedIds = new Set(moved.map((t) => t.id));
    return {
      tasks: kept.map((t) => ({
        ...t,
        parentIds: (t.parentIds || []).filter((pid) => !movedIds.has(pid)),
      })),
      moved: moved.map((t) => this.toBacklogEntry(t, tracks, originMs)),
    };
  }

  // Board task -> backlog entry (absolute time + track identity, no lane index:
  // lanes are positional and would rot while the task sits in the backlog).
  toBacklogEntry(task, tracks, originMs) {
    const track = (tracks || [])[task.lane] || {};
    const { lane, start, ...rest } = task;
    return {
      ...rest,
      startMs: originMs + Math.round(start || 0) * MS_PER_MIN,
      trackId: track.id || null,
      trackName: track.name || 'Untitled track',
      trackColor: track.color || PALETTE[0],
      backloggedAt: typeof task.backloggedAt === 'number' ? task.backloggedAt : Date.now(),
    };
  }

  // Backlog entries persist in exactly their in-memory (absolute) shape, so
  // hydration is just validation + defaults.
  hydrateBacklog(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((b) => b && typeof b.startMs === 'number')
      .map((b) => ({
        ...b,
        title: b.title || 'Untitled task',
        duration: b.duration || SNAP_MIN,
        done: !!b.done,
        parentIds: [],
        notes: typeof b.notes === 'string' ? b.notes : '',
        trackName: b.trackName || 'Untitled track',
        trackColor: b.trackColor || PALETTE[0],
        backloggedAt: typeof b.backloggedAt === 'number' ? b.backloggedAt : Date.now(),
      }));
  }

  // Newest-scheduled first — the most recently missed work reads at the top.
  sortBacklog(list) {
    return [...list].sort((a, b) => (b.startMs || 0) - (a.startMs || 0));
  }

  // Adopt a saved blob (localStorage cache or disk) into fresh in-memory slices,
  // re-anchored to today and with off-canvas tasks swept into the backlog.
  // "Breaks" is a fixed part of the board, not an ordinary timeline: it always
  // occupies the top lane. Moving it means renumbering every task's lane, so
  // this returns the corrected pair and callers persist both together.
  pinBreaks(tracks, tasks) {
    const at = (tracks || []).findIndex((t) => isBreakTrack(t.name));
    if (at <= 0) return { tracks, tasks, changed: false };
    const next = tracks.slice();
    const [brk] = next.splice(at, 1);
    next.unshift(brk);
    const laneById = {};
    next.forEach((t, i) => (laneById[t.id] = i));
    const fixed = (tasks || []).map((t) => {
      const was = tracks[t.lane];
      const lane = was && laneById[was.id] != null ? laneById[was.id] : t.lane;
      return lane === t.lane ? t : { ...t, lane };
    });
    return { tracks: next, tasks: fixed, changed: true };
  }

  // Index of the pinned Breaks lane, or -1 when the board has no Breaks track.
  breakLane() {
    return this.state.tracks.findIndex((t) => isBreakTrack(t.name));
  }

  adoptSaved(saved) {
    const originMs = this.resolveOrigin();
    const legacyOrigin = this.savedOrigin(saved);
    const tracks = this.normalizeTracks(saved.tracks, this.state.tracks);
    const hydrated = this.hydrateTasks(saved.tasks, originMs, legacyOrigin);
    const { tasks, moved } = this.partitionOffCanvas(hydrated, tracks, originMs);
    const backlog = this.sortBacklog([...this.hydrateBacklog(saved.backlog), ...moved]);
    const pinned = this.pinBreaks(tracks, tasks);
    return {
      originMs,
      tracks: pinned.tracks,
      tasks: pinned.tasks,
      backlog,
      migrated: moved.length > 0 || legacyOrigin !== originMs || pinned.changed,
      tags: this.normalizeTags(saved),
      deletedTracks: this.hydrateDeleted(saved.deletedTracks, originMs, legacyOrigin),
      dividers: this.normalizeDividers(saved.dividers, pinned.tracks),
      todos: hydrateTodos(saved.todos),
      nowMin: minutesSince(originMs),
    };
  }

  // Keep only dividers whose anchor track still exists on the active board.
  normalizeDividers(raw, tracks) {
    const ids = new Set((tracks || []).map((t) => t.id));
    return (Array.isArray(raw) ? raw : []).filter(
      (d) => d && typeof d.afterTrackId === 'string' && ids.has(d.afterTrackId),
    );
  }

  // Write the local (localStorage) cache in the absolute persist form.
  saveLocal(tasks, tracks, tags, deleted, dividers, backlog, todos) {
    saveData(
      this.serializeTasks(tasks, this.state.originMs),
      tracks,
      this.state.originMs,
      tags ?? this.state.tags,
      this.serializeDeleted(deleted ?? this.state.deletedTracks, this.state.originMs),
      dividers ?? this.state.dividers,
      backlog ?? this.state.backlog,
      todos ?? this.state.todos,
    );
  }

  componentDidMount() {
    this.stopNarrowWatch = onNarrowChange((narrow) => this.setState({ narrow }));
    const s = loadData();
    if (s) {
      const next = this.adoptSaved(s);
      delete next.migrated;
      this.setState(next);
    }
    const v = loadView();
    if (v) {
      this.setState({
        orientation: v.orientation || 'horizontal',
        sidebarWidth: v.sidebarWidth || 150,
        sidebarCollapsed: !!v.sidebarCollapsed,
        zoom: v.zoom ?? this.state.zoom,
        trackWidth: v.trackWidth ?? this.state.trackWidth,
        panelWidth: v.panelWidth ?? this.state.panelWidth,
      });
    }
    // Clock tick. Also the day-rollover guard: a tab left open past the end of
    // the 48h window would drift out of range exactly like a stale saved origin,
    // so re-anchor to today whenever "now" leaves the canvas (#96).
    this.timer = setInterval(() => this.tickNow(), 15000);
    document.addEventListener('keydown', this.onDocKeyDown);
    // Capture phase: several inner elements (task cards, panels, lane buttons)
    // stopPropagation on mousedown, which would hide the click from a bubble-phase
    // listener. Capturing runs before any of them, so outside-click detection is
    // reliable; we still bail out for clicks inside a panel / on its opener.
    document.addEventListener('mousedown', this.onDocPointerDown, true);
    window.addEventListener('hashchange', this.onHashChange);
    // Best-effort flush of any pending debounced disk write on page unload.
    this._onBeforeUnload = () => {
      if (!this._hydrated || this._diskUnavailable) return;
      clearTimeout(this._diskTimer);
      this._diskTimer = null;
      // fetch() is cancelled when the page goes away (and mobile Safari often
      // skips beforeunload entirely), so send a beacon instead.
      saveStateBeacon(this.diskPayload(), this._rev);
    };
    window.addEventListener('beforeunload', this._onBeforeUnload);
    // Phones background a tab instead of unloading it: persist on hide too.
    this._onVisibility = () => {
      if (document.visibilityState === 'hidden') this._onBeforeUnload();
      else this.pollDisk();
    };
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('pagehide', this._onBeforeUnload);
    const doJump = () => this.jumpToNow(false);
    requestAnimationFrame(() => requestAnimationFrame(doJump));
    setTimeout(doJump, 150);
    // Pomodoro engine tick (runs for the app's lifetime; no-op while paused).
    // Remember the base tab title so we can restore it when the timer stops.
    this._pomoBaseTitle = document.title;
    this.pomoTimer = setInterval(() => this.pomoTick(), 250);
    if (this.state.pomo.running) this.updatePomoTitle();
    // Scroll-aware date indicator: the scroller is scrollRef in horizontal and
    // boardRef in vertical, so listen on both (passive; the handler is a no-op
    // on whichever isn't overflowing).
    [this.scrollRef.current, this.boardRef.current].forEach((el) => {
      if (el) el.addEventListener('scroll', this.onBoardScroll, { passive: true });
    });
    // Touchscreens: long-press a card to drag it, grab a dot/edge to wire or
    // resize. Bridges to the same mouse handlers (see lib/touchDrag.js).
    this.stopTouchDrag = installTouchDrag(document);
    // Disk is the source of truth: hydrate asynchronously after first paint.
    this.hydrateFromDisk();
  }

  // 15s clock tick + day-rollover guard (#96). While the origin still covers
  // now, this is just a nowMin refresh; once now runs past the end of the
  // canvas the board is re-anchored to today and anything left behind is swept
  // into the backlog.
  tickNow() {
    const nowMin = minutesSince(this.state.originMs);
    if (nowMin >= 0 && nowMin < LAYOUT.totalMin) {
      this.setState({ nowMin });
      return;
    }
    this.reanchorToToday();
  }

  // Move pixel-0 to today's local midnight, translating every task (active and
  // archived) by the same delta so absolute times are preserved, then sweep
  // whatever no longer fits onto the canvas into the backlog.
  //
  // Deliberately NOT routed through persist(): this is a clock-driven migration,
  // not a user edit, so it must not land on the undo stack (undoing it would
  // restore a board parked in the past). It still writes both caches.
  reanchorToToday(done) {
    const originMs = this.resolveOrigin();
    const prevOrigin = this.state.originMs;
    if (originMs === prevOrigin) {
      this.setState({ nowMin: minutesSince(originMs) }, done);
      return;
    }
    const shift = (prevOrigin - originMs) / MS_PER_MIN;
    const shiftTasks = (list) => list.map((t) => ({ ...t, start: Math.round((t.start || 0) + shift) }));
    const shifted = shiftTasks(this.state.tasks);
    const deletedTracks = this.state.deletedTracks.map((d) => ({
      ...d,
      tasks: shiftTasks(d.tasks || []),
    }));
    const { tasks, moved } = this.partitionOffCanvas(shifted, this.state.tracks, originMs);
    const backlog = this.sortBacklog([...this.state.backlog, ...moved]);
    this.setState(
      { originMs, tasks, backlog, deletedTracks, nowMin: minutesSince(originMs) },
      () => {
        this.saveLocal(tasks, this.state.tracks, null, deletedTracks, null, backlog);
        this.syncDisk();
        if (done) done();
      },
    );
  }

  // Build the view-preferences object persisted to both localStorage and disk.
  currentView() {
    return {
      orientation: this.state.orientation,
      sidebarWidth: this.state.sidebarWidth,
      sidebarCollapsed: this.state.sidebarCollapsed,
      zoom: this.state.zoom,
      trackWidth: this.state.trackWidth,
      panelWidth: this.state.panelWidth,
    };
  }

  diskPayload() {
    return {
      tasks: this.serializeTasks(this.state.tasks, this.state.originMs),
      tracks: this.state.tracks,
      tags: this.state.tags,
      deletedTracks: this.serializeDeleted(this.state.deletedTracks, this.state.originMs),
      dividers: this.state.dividers,
      // Backlog entries are already absolute (startMs), so they persist as-is.
      backlog: this.state.backlog,
      todos: this.state.todos,
      origin: this.state.originMs,
      view: this.currentView(),
    };
  }

  // Debounced disk write. No-ops until hydration completes so an in-flight load
  // can't be overwritten by a stale save. 150ms is short enough that a task is
  // on disk before you can reach for the other device.
  syncDisk() {
    this._lastEditAt = Date.now();
    if (!this._hydrated) {
      this._dirtyBeforeHydration = true;
      return;
    }
    clearTimeout(this._diskTimer);
    this._diskTimer = setTimeout(() => {
      this._diskTimer = null;
      this.writeDisk();
    }, 150);
  }

  flushDiskSave() {
    if (!this._hydrated || !this._diskTimer) return;
    clearTimeout(this._diskTimer);
    this._diskTimer = null;
    this.writeDisk();
  }

  // Would writing `mine` over `disk` lose data? Conservative mirror of the
  // server's guard: any drop in tasks/todos/backlog count, or a task/todo
  // flipping done→undone, is treated as a regression. Both payloads are in the
  // serialized disk shape (arrays of {id, done, ...}).
  regressesDisk(disk, mine) {
    const len = (x) => (Array.isArray(x) ? x.length : 0);
    if (len(mine.tasks) < len(disk.tasks)) return true;
    if (len(mine.todos) < len(disk.todos)) return true;
    if (len(mine.backlog) < len(disk.backlog)) return true;
    const doneById = (arr) => {
      const m = new Map();
      (Array.isArray(arr) ? arr : []).forEach((t) => t && t.id != null && m.set(t.id, !!t.done));
      return m;
    };
    for (const key of ['tasks', 'todos']) {
      const before = doneById(disk[key]);
      const after = doneById(mine[key]);
      for (const [id, wasDone] of before) {
        if (wasDone && after.has(id) && !after.get(id)) return true;
      }
    }
    return false;
  }

  // One write at a time; anything that lands mid-flight is coalesced into a
  // follow-up so the last state always reaches disk.
  async writeDisk() {
    if (!this._hydrated) return;
    if (this._saveInFlight) {
      this._saveAgain = true;
      return;
    }
    this._saveInFlight = true;
    this.markSync('syncing');
    try {
      const res = await saveState(this.diskPayload(), this._rev);
      if (res.ok) {
        if (typeof res.rev === 'number') this._rev = res.rev;
        this.markSync('online');
      } else if (res.conflict) {
        // Someone else (the other device) saved since we last read. If the user
        // just edited here, their intent normally wins: re-send on top of the
        // newer revision. BUT a blind force-win can wipe the other device's
        // work — the exact failure that lost a whole evening of tasks. So we
        // force only when our write would NOT regress the newer disk state
        // (no fewer tasks/todos/backlog, no done→undone). If it WOULD regress,
        // the newer disk wins and we adopt it instead of clobbering.
        this._rev = typeof res.rev === 'number' ? res.rev : this._rev;
        const recentlyEdited = Date.now() - this._lastEditAt < 10000;
        const mine = this.diskPayload();
        const safe = !res.state || !this.regressesDisk(res.state, mine);
        if (recentlyEdited && safe) {
          const retry = await saveState(mine, this._rev, true);
          if (retry.ok && typeof retry.rev === 'number') this._rev = retry.rev;
          this.markSync(retry.ok ? 'online' : 'offline');
        } else if (res.state) {
          this.applyDiskState(res.state, res.rev);
          this.markSync('online');
        } else {
          this.markSync('offline');
        }
      } else {
        // Not ok and not a conflict → the Mac was unreachable.
        this.markSync('offline');
      }
    } finally {
      this._saveInFlight = false;
      if (this._saveAgain) {
        this._saveAgain = false;
        this.writeDisk();
      }
    }
  }

  // Apply a state object that came from disk (first load, or a newer revision
  // another device wrote) onto this client.
  applyDiskState(disk, rev, opts) {
    const next = this.adoptSaved(disk);
    const migrated = next.migrated;
    delete next.migrated;
    const view = disk.view || {};
    if (typeof rev === 'number') this._rev = rev;
    this.setState(
      {
        ...next,
        orientation: view.orientation || this.state.orientation,
        sidebarWidth: view.sidebarWidth || this.state.sidebarWidth,
        sidebarCollapsed:
          view.sidebarCollapsed != null ? !!view.sidebarCollapsed : this.state.sidebarCollapsed,
        zoom: view.zoom ?? this.state.zoom,
        trackWidth: view.trackWidth ?? this.state.trackWidth,
        panelWidth: view.panelWidth ?? this.state.panelWidth,
      },
      () => {
        this.saveLocal(this.state.tasks, this.state.tracks, this.state.tags);
        saveView(this.currentView());
        this._hydrated = true;
        if (opts && opts.jump) {
          // Write the re-anchored/backlogged result straight back, so the file
          // stops carrying the stale origin and the sweep isn't redone next load.
          if (migrated) this.writeDisk();
          this.jumpToNow(false);
        }
      },
    );
  }

  async hydrateFromDisk() {
    const res = await loadState();
    if (res.ok && res.state && Array.isArray(res.state.tasks)) {
      // Disk wins on boot, always. The localStorage copy is only a fast-paint
      // cache: on a second device it is usually an OLD snapshot, and adopting
      // it here is what used to overwrite the other device's tasks.
      this.applyDiskState(res.state, res.rev, { jump: true });
      this.startDiskPoll();
      // Once the loaded state is committed, clear to-dos deleted over a week
      // ago. Deferred so it runs against the hydrated state, not the empty one.
      setTimeout(() => this.purgeDeletedTodos(), 0);
      return;
    }
    if (res.ok && res.empty) {
      // Server reachable, nothing saved yet: seed it from what we have.
      this._hydrated = true;
      this._rev = typeof res.rev === 'number' ? res.rev : 0;
      this.writeDisk();
      this.startDiskPoll();
      return;
    }
    // Couldn't reach the state API (offline, or opened as a static build).
    // Stay on localStorage and never push this snapshot at the server — a
    // failed read must not look like "disk is empty". Show the last synced board
    // read-only and keep polling so it goes live again the moment the Mac wakes.
    this._hydrated = true;
    this._rev = null;
    this._diskUnavailable = true;
    this.markSync('offline');
    this.startDiskPoll();
  }

  // Poll for changes made on another device so both stay current without a
  // manual refresh. Skipped while the tab is hidden, while a write is in
  // flight, and during an active edit/drag so nothing changes under the cursor.
  startDiskPoll() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => this.pollDisk(), 4000);
  }

  async pollDisk() {
    if (!this._hydrated || this._saveInFlight || this._diskTimer) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (Date.now() - this._lastEditAt < 3000) return;
    if (this.state.drag || this.state.marquee || this.state.editingId || this.state.wiring) return;
    const el = typeof document !== 'undefined' ? document.activeElement : null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    const res = await loadState();
    // A reachable Mac answers with ok (state, empty, or just a rev); only a
    // transport failure comes back ok:false — that's what flips us to offline.
    if (res.ok === false) {
      this.markSync('offline');
      return;
    }
    this.markSync('online');
    // Mac is back after an offline stretch: re-enable disk writes/beacon.
    this._diskUnavailable = false;
    if (!res.ok || !res.state || !Array.isArray(res.state.tasks)) return;
    if (typeof res.rev !== 'number' || res.rev === this._rev) return;
    this.applyDiskState(res.state, res.rev);
  }

  // Record the live sync-to-Mac status for the header pill. Only re-renders
  // when something actually changed, so the 4s poll doesn't thrash React.
  // A successful round-trip also stamps lastSyncAt for the "synced Xs ago" hint.
  markSync(next) {
    const patch = { syncState: next };
    if (next === 'online') patch.lastSyncAt = Date.now();
    if (this.state.syncState === next && next !== 'online') return;
    this.setState(patch);
  }

  // Manual "sync now": pull the latest from the Mac (adopting it when newer,
  // and only when it won't clobber local edits) then push anything local so
  // both ends match. Used by the header pill when sync has gone offline.
  async syncNow() {
    if (!this._hydrated) return;
    this.markSync('syncing');
    const res = await loadState();
    if (res.ok === false) {
      this.markSync('offline');
      return;
    }
    if (res.ok && res.state && Array.isArray(res.state.tasks) && typeof res.rev === 'number') {
      // Adopt the newer disk state unless our local copy would be regressed by
      // it (same guard writeDisk uses, so a manual sync can't lose work).
      if (res.rev !== this._rev && !this.regressesDisk(res.state, this.diskPayload())) {
        this.applyDiskState(res.state, res.rev);
      } else if (typeof res.rev === 'number') {
        this._rev = res.rev;
      }
    }
    this.markSync('online');
    await this.writeDisk();
  }

  componentWillUnmount() {
    if (this.stopTouchDrag) this.stopTouchDrag();
    if (this.stopNarrowWatch) this.stopNarrowWatch();
    clearInterval(this.timer);
    clearInterval(this._pollTimer);
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('pagehide', this._onBeforeUnload);
    this.flushDiskSave();
    document.removeEventListener('keydown', this.onDocKeyDown);
    document.removeEventListener('mousedown', this.onDocPointerDown, true);
    window.removeEventListener('hashchange', this.onHashChange);
    window.removeEventListener('beforeunload', this._onBeforeUnload);
    this.scroller.stop();
    this.removeBoardListeners();
    document.removeEventListener('mousemove', this.onTrackDragMove);
    document.removeEventListener('mouseup', this.onTrackDragUp);
    document.removeEventListener('mousemove', this.onWireMove);
    document.removeEventListener('mouseup', this.onWireUp);
    document.removeEventListener('mousemove', this.onSidebarResizeMove);
    document.removeEventListener('mouseup', this.onSidebarResizeUp);
    [this.scrollRef.current, this.boardRef.current].forEach((el) => {
      if (el) el.removeEventListener('scroll', this.onBoardScroll);
    });
    if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);
    clearTimeout(this._scrollPillTimer);
    clearInterval(this.pomoTimer);
    if (this._pomoBaseTitle != null) document.title = this._pomoBaseTitle;
  }

  // Offline the Mac is the source of truth and this device is view-only, so no
  // edit may be made that the phone can't persist (it would be silently wiped by
  // the next successful poll). Mutators funnel through persist/undo/redo, so a
  // single guard here makes the whole board read-only while offline.
  isReadOnly() {
    return this.state.syncState === 'offline';
  }

  // Briefly surface why an edit didn't take, then clear it.
  flashReadOnly() {
    this.setState({ readOnlyNudge: true });
    clearTimeout(this._roNudgeTimer);
    this._roNudgeTimer = setTimeout(() => this.setState({ readOnlyNudge: false }), 2200);
  }

  persist(tasks, tracks, tags, deleted, dividers, backlog, todos) {
    if (this.isReadOnly()) {
      this.flashReadOnly();
      return;
    }
    const t = tasks || this.state.tasks;
    const tr = tracks || this.state.tracks;
    const tg = tags || this.state.tags;
    const del = deleted || this.state.deletedTracks;
    const dv = dividers || this.state.dividers;
    const bk = backlog || this.state.backlog;
    const td = todos || this.state.todos;
    // Snapshot the pre-change state for undo (arrays are always replaced
    // immutably, so holding references is safe).
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.saveLocal(t, tr, tg, del, dv, bk, td);
    this.setState({ tasks: t, tracks: tr, tags: tg, deletedTracks: del, dividers: dv, backlog: bk, todos: td });
    this.syncDisk();
  }

  // The persisted slices, captured for the undo/redo stacks.
  snapshot() {
    return {
      tasks: this.state.tasks,
      tracks: this.state.tracks,
      tags: this.state.tags,
      deletedTracks: this.state.deletedTracks,
      dividers: this.state.dividers,
      backlog: this.state.backlog,
      todos: this.state.todos,
    };
  }

  undo() {
    if (this.isReadOnly()) {
      this.flashReadOnly();
      return;
    }
    if (!this.undoStack.length) return;
    const prev = this.undoStack.pop();
    this.redoStack.push(this.snapshot());
    const prevTags = prev.tags ?? this.state.tags;
    const prevDeleted = prev.deletedTracks ?? this.state.deletedTracks;
    const prevDividers = prev.dividers ?? this.state.dividers;
    const prevBacklog = prev.backlog ?? this.state.backlog;
    const prevTodos = prev.todos ?? this.state.todos;
    this.saveLocal(prev.tasks, prev.tracks, prevTags, prevDeleted, prevDividers, prevBacklog, prevTodos);
    const liveIds = new Set(prev.tasks.map((t) => t.id));
    this.setState({
      tasks: prev.tasks,
      tracks: prev.tracks,
      tags: prevTags,
      deletedTracks: prevDeleted,
      dividers: prevDividers,
      backlog: prevBacklog,
      todos: prevTodos,
      selection: this.state.selection.filter((id) => liveIds.has(id)),
    });
    this.syncDisk();
  }

  redo() {
    if (this.isReadOnly()) {
      this.flashReadOnly();
      return;
    }
    if (!this.redoStack.length) return;
    const next = this.redoStack.pop();
    this.undoStack.push(this.snapshot());
    const nextTags = next.tags ?? this.state.tags;
    const nextDeleted = next.deletedTracks ?? this.state.deletedTracks;
    const nextDividers = next.dividers ?? this.state.dividers;
    const nextBacklog = next.backlog ?? this.state.backlog;
    const nextTodos = next.todos ?? this.state.todos;
    this.saveLocal(next.tasks, next.tracks, nextTags, nextDeleted, nextDividers, nextBacklog, nextTodos);
    const liveIds = new Set(next.tasks.map((t) => t.id));
    this.setState({
      tasks: next.tasks,
      tracks: next.tracks,
      tags: nextTags,
      deletedTracks: nextDeleted,
      dividers: nextDividers,
      backlog: nextBacklog,
      todos: nextTodos,
      selection: this.state.selection.filter((id) => liveIds.has(id)),
    });
    this.syncDisk();
  }

  deleteSelected() {
    if (!this.state.selection.length) return;
    const sel = new Set(this.state.selection);
    const tasks = this.state.tasks
      .filter((t) => !sel.has(t.id))
      .map((t) => ({ ...t, parentIds: (t.parentIds || []).filter((pid) => !sel.has(pid)) }));
    const todos = this.unlinkTodosFor([...sel]);
    this.setState({ selection: [] });
    this.persist(tasks, null, null, null, null, null, todos);
  }

  // Copy the currently-selected tasks into the in-app clipboard as id-less field
  // templates. Returns true when something was captured (so the caller can
  // preventDefault only then and let native copy work otherwise).
  copySelection() {
    if (!this.state.selection.length) return false;
    const sel = new Set(this.state.selection);
    this._clipboard = this.state.tasks
      .filter((t) => sel.has(t.id))
      .map((t) => ({
        title: t.title,
        lane: t.lane,
        start: t.start,
        duration: t.duration,
        done: !!t.done,
        parentIds: [...(t.parentIds || [])],
        notes: t.notes || '',
      }));
    return true;
  }

  // Paste clipboard tasks as duplicates: same start, track, name and duration as
  // the source (overlap is expected). Each copy gets a fresh id; the pasted
  // tasks become the new selection so a follow-up drag moves the copies. Goes
  // through persist() so it saves to disk/localStorage and is undoable.
  pasteClipboard() {
    if (!this._clipboard.length) return false;
    const stamp = Date.now();
    const copies = this._clipboard.map((c, i) => ({
      id: 'id' + stamp + '_' + i + '_' + Math.floor(Math.random() * 9999),
      title: c.title,
      lane: c.lane,
      start: c.start,
      duration: c.duration,
      done: !!c.done,
      parentIds: [...(c.parentIds || [])],
      notes: c.notes || '',
    }));
    this.setState({ selection: copies.map((c) => c.id) });
    this.persist([...this.state.tasks, ...copies]);
    return true;
  }

  onDocKeyDown(e) {
    // A confirmation dialog is open: Esc cancels it; every other shortcut waits.
    if (this.state.confirmDeleteTrackId) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.setState({ confirmDeleteTrackId: null });
      }
      return;
    }
    const el = document.activeElement;
    const typing =
      el &&
      (el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable);
    if (typing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && (e.key === 'c' || e.key === 'C')) {
      // Only intercept when we actually have tasks selected; otherwise let the
      // browser's normal copy proceed.
      if (this.copySelection()) e.preventDefault();
      return;
    }
    if (mod && (e.key === 'v' || e.key === 'V')) {
      if (this.pasteClipboard()) e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      // Escape cancels a pending two-click connection first, else closes the
      // open task detail panel.
      if (this.state.pendingConnect) {
        this.cancelPendingConnect();
        e.preventDefault();
      } else if (this.state.panelTaskId) {
        this.closePanel();
        e.preventDefault();
      } else if (this.state.backlogTrackId) {
        this.closeBacklogPanel();
        e.preventDefault();
      } else if (this.state.todoPanelOpen) {
        this.closeTodoPanel();
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.state.selection.length) {
        e.preventDefault();
        this.deleteSelected();
      }
    }
  }

  persistView(next) {
    const v = {
      orientation: next.orientation ?? this.state.orientation,
      sidebarWidth: next.sidebarWidth ?? this.state.sidebarWidth,
      sidebarCollapsed: next.sidebarCollapsed ?? this.state.sidebarCollapsed,
      zoom: next.zoom ?? this.state.zoom,
      trackWidth: next.trackWidth ?? this.state.trackWidth,
      panelWidth: next.panelWidth ?? this.state.panelWidth,
    };
    saveView(v);
    this.syncDisk();
  }

  setZoom(z) {
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    // Anchor the time at the horizontal center of the viewport so the timeline
    // expands/shrinks from the center instead of jumping.
    const sc = this.scrollRef.current;
    const oldPx = this.timeDensity();
    const centerTime = sc ? (sc.scrollLeft + sc.clientWidth / 2) / oldPx : null;
    this.setState({ zoom }, () => {
      this.persistView({ zoom });
      if (sc && centerTime != null) {
        requestAnimationFrame(() => {
          const newPx = this.timeDensity();
          sc.scrollLeft = Math.max(0, centerTime * newPx - sc.clientWidth / 2);
        });
      }
    });
  }

  setTrackWidth(w) {
    const trackWidth = Math.max(TRACKW_MIN, Math.min(TRACKW_MAX, w));
    // Vertical density scales the track (cross) axis horizontally; anchor the
    // centered track column so the horizontal view doesn't jump.
    const sc = this.scrollRef.current;
    const oldCross = this.laneCross();
    const centerCross = sc ? (sc.scrollLeft + sc.clientWidth / 2) / oldCross : null;
    this.setState({ trackWidth }, () => {
      this.persistView({ trackWidth });
      if (sc && centerCross != null) {
        requestAnimationFrame(() => {
          const newCross = this.laneCross();
          sc.scrollLeft = Math.max(0, centerCross * newCross - sc.clientWidth / 2);
        });
      }
    });
  }

  trackFor(lane) {
    return (
      this.state.tracks[lane] || {
        name: 'Track ' + (lane + 1),
        color: this.palette[lane % this.palette.length],
        tagIds: [],
      }
    );
  }

  cycleTrackColor(index) {
    const tracks = this.state.tracks.slice();
    while (tracks.length <= index)
      tracks.push({
        id: genTrackId(),
        name: 'Track ' + (tracks.length + 1),
        color: this.palette[tracks.length % this.palette.length],
        tagIds: [],
      });
    const cur = tracks[index].color;
    const idx = this.palette.indexOf(cur);
    tracks[index] = { ...tracks[index], color: this.palette[(idx + 1) % this.palette.length] };
    this.persist(null, tracks);
  }

  renameTrack(index, name) {
    const tracks = this.state.tracks.slice();
    while (tracks.length <= index)
      tracks.push({
        id: genTrackId(),
        name: 'Track ' + (tracks.length + 1),
        color: this.palette[tracks.length % this.palette.length],
        tagIds: [],
      });
    tracks[index] = { ...tracks[index], name: (name || '').trim() || 'Track ' + (index + 1) };
    // Renaming a lane to "Breaks" makes it the pinned rest lane straight away.
    const pinned = this.pinBreaks(tracks, this.state.tasks);
    this.persist(pinned.changed ? pinned.tasks : null, pinned.tracks);
  }

  addTrack() {
    const tracks = this.state.tracks.slice();
    tracks.push({
      id: genTrackId(),
      name: 'Track ' + (tracks.length + 1),
      color: this.palette[tracks.length % this.palette.length],
      tagIds: [],
    });
    this.persist(null, tracks);
  }

  // ---- Tags ----------------------------------------------------------------

  // Pick the first PALETTE color not already used by a tag; fall back to
  // cycling by count once every color is taken.
  nextTagColor() {
    const used = new Set(this.state.tags.map((t) => t.color));
    return PALETTE.find((c) => !used.has(c)) || PALETTE[this.state.tags.length % PALETTE.length];
  }

  openTagPicker(trackIndex, rect) {
    this.setState({ tagPicker: { trackIndex, rect } });
  }

  closeTagPicker() {
    this.setState({ tagPicker: null });
  }

  // Toggle a tag's assignment on a track.
  toggleTrackTag(trackIndex, tagId) {
    const tracks = this.state.tracks.map((tr, i) => {
      if (i !== trackIndex) return tr;
      const ids = tr.tagIds || [];
      return { ...tr, tagIds: ids.includes(tagId) ? ids.filter((x) => x !== tagId) : [...ids, tagId] };
    });
    this.persist(null, tracks);
  }

  // Create a global tag (reusing an existing one with the same label) and
  // assign it to the track.
  createAndAssignTag(trackIndex, label) {
    const lbl = (label || '').trim();
    if (!lbl) return;
    let tag = this.state.tags.find((t) => t.label.toLowerCase() === lbl.toLowerCase());
    let tags = this.state.tags;
    if (!tag) {
      tag = { id: genTagId(), label: lbl, color: this.nextTagColor() };
      tags = [...this.state.tags, tag];
    }
    const tracks = this.state.tracks.map((tr, i) => {
      if (i !== trackIndex) return tr;
      const ids = tr.tagIds || [];
      return ids.includes(tag.id) ? tr : { ...tr, tagIds: [...ids, tag.id] };
    });
    this.persist(null, tracks, tags);
  }

  // Recolor a tag globally (cascades to every track that uses it).
  setTagColor(tagId, color) {
    const tags = this.state.tags.map((t) => (t.id === tagId ? { ...t, color } : t));
    this.persist(null, null, tags);
  }

  // Relabel a tag globally.
  setTagLabel(tagId, label) {
    const lbl = (label || '').trim();
    if (!lbl) return;
    const tags = this.state.tags.map((t) => (t.id === tagId ? { ...t, label: lbl } : t));
    this.persist(null, null, tags);
  }

  // Delete a tag globally: drop it from the tag collection and unassign it from
  // every active track's tagIds.
  deleteTag(tagId) {
    const tags = this.state.tags.filter((t) => t.id !== tagId);
    const tracks = this.state.tracks.map((tr) => {
      const ids = tr.tagIds || [];
      return ids.includes(tagId) ? { ...tr, tagIds: ids.filter((x) => x !== tagId) } : tr;
    });
    this.persist(null, tracks, tags);
  }

  // Hash-based routing (dependency-free, no react-router): '#/archive' -> the
  // Deleted Tracks page, '#/tags' -> the Tag Manager, '#/tag/<id>' -> the
  // tasks-by-tag page (id captured separately), anything else -> timeline.
  static parseHash() {
    if (typeof window === 'undefined') return { name: 'timeline', tagId: null };
    const h = window.location.hash;
    if (h === '#/archive') return { name: 'archive', tagId: null };
    if (h === '#/backlog') return { name: 'backlog', tagId: null };
    if (h === '#/completed') return { name: 'completed', tagId: null };
    if (h === '#/tags') return { name: 'tags', tagId: null };
    const m = h.match(/^#\/tag\/(.+)$/);
    if (m) return { name: 'tag', tagId: decodeURIComponent(m[1]) };
    return { name: 'timeline', tagId: null };
  }

  static routeFromHash() {
    return App.parseHash().name;
  }

  // Returning to the board from any page (Completed, Backlog, Tags, Archive —
  // via a Back button or browser history) remounts the timeline scrolled to its
  // start, so re-centre on now once it has laid out.
  componentDidUpdate(prevProps, prevState) {
    if (prevState.route !== 'timeline' && this.state.route === 'timeline') {
      const doJump = () => {
        if (this.state.route === 'timeline') this.jumpToNow(false);
      };
      requestAnimationFrame(() => requestAnimationFrame(doJump));
      setTimeout(doJump, 150);
    }
  }

  onHashChange() {
    const r = App.parseHash();
    this.setState({ route: r.name, routeTagId: r.tagId });
  }

  goArchive() {
    window.location.hash = '#/archive';
    this.setState({ route: 'archive' });
  }

  goCompleted() {
    window.location.hash = '#/completed';
    this.setState({ route: 'completed', backlogTrackId: null, backlogHoverId: null });
  }

  // Every finished task, newest first. A task counts as finished at its
  // scheduled END (start + duration), not when the checkbox was clicked, since
  // done is often marked late; the click time is kept only as `markedAt`.
  completedTasks() {
    const { tasks, tracks, backlog, originMs } = this.state;
    const trackById = {};
    tracks.forEach((tr) => (trackById[tr.id] = tr));
    const out = [];
    const push = (src, startMs, track) => {
      out.push({
        id: src.id,
        title: src.title,
        duration: src.duration,
        notes: src.notes,
        startMs,
        completedAt: startMs + (src.duration || 0) * MS_PER_MIN,
        markedAt: typeof src.completedAt === 'number' ? src.completedAt : null,
        claudeSession: !!src.claudeSession,
        trackName: track.name,
        trackColor: track.color,
      });
    };
    tasks.forEach((t) => {
      if (!t.done) return;
      push(t, originMs + Math.round(t.start || 0) * MS_PER_MIN, tracks[t.lane] || {});
    });
    backlog.forEach((b) => {
      if (!b.done || typeof b.startMs !== 'number') return;
      const live = trackById[b.trackId];
      push(b, b.startMs, live ? live : { name: b.trackName, color: b.trackColor });
    });
    return out.sort((a, b) => b.completedAt - a.completedAt || b.startMs - a.startMs);
  }

  goBacklog() {
    window.location.hash = '#/backlog';
    this.setState({ route: 'backlog' });
  }

  goTags() {
    window.location.hash = '#/tags';
    this.setState({ route: 'tags' });
  }

  goTag(tagId) {
    if (!tagId) return;
    window.location.hash = '#/tag/' + encodeURIComponent(tagId);
    this.setState({ route: 'tag', routeTagId: tagId });
  }

  goTimeline() {
    // Clear the hash without leaving a bare '#'; then sync route (hashchange
    // may not fire if the hash was already empty).
    if (window.location.hash) {
      history.pushState('', document.title, window.location.pathname + window.location.search);
    }
    this.setState({ route: 'timeline' });
  }

  // Soft delete: move the track (with its tasks, tagIds and a timestamp) into
  // the archive instead of destroying it, then remove it from the active board.
  // Pending work on a track: unfinished board tasks + unfinished backlog entries.
  pendingForTrack(index) {
    const track = this.state.tracks[index];
    if (!track) return { board: [], backlog: [] };
    const board = this.state.tasks.filter((t) => t.lane === index && !t.done).sort((a, b) => a.start - b.start);
    const backlog = this.state.backlog.filter((b) => b.trackId === track.id && !b.done);
    return { board, backlog };
  }

  // Delete immediately when nothing is pending; otherwise ask first.
  requestDeleteTrack(index) {
    if (this.state.tracks.length <= 1) return;
    if (isBreakTrack(this.trackFor(index).name)) return;
    const { board, backlog } = this.pendingForTrack(index);
    if (!board.length && !backlog.length) return this.deleteTrack(index);
    this.setState({ confirmDeleteTrackId: this.state.tracks[index].id });
  }

  renderConfirmDeleteTrack() {
    const id = this.state.confirmDeleteTrackId;
    const index = this.state.tracks.findIndex((t) => t.id === id);
    if (index < 0) return null;
    const track = this.state.tracks[index];
    const { board, backlog } = this.pendingForTrack(index);
    const close = () => this.setState({ confirmDeleteTrackId: null });
    const tf = this.props.timeFormat;
    const dayWord = (ms) => {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const d = new Date(ms); d.setHours(0, 0, 0, 0);
      const diff = Math.round((d - d0) / 86400000);
      return diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff === -1 ? 'yesterday' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    return (
      <ConfirmDeleteTrack
        trackName={track.name}
        color={track.color}
        boardTasks={board}
        backlogTasks={backlog}
        fmtBoardWhen={(t) => {
          const ms = this.state.originMs + Math.round(t.start) * MS_PER_MIN;
          const d = new Date(ms);
          return dayWord(ms) + ' ' + fmt(d.getHours() * 60 + d.getMinutes(), tf);
        }}
        fmtBacklogWhen={(b) => 'pushed ' + dayWord(b.backloggedAt || Date.now())}
        onCancel={close}
        onConfirm={() => {
          close();
          this.deleteTrack(index);
        }}
      />
    );
  }

  deleteTrack(index) {
    if (this.state.tracks.length <= 1) return;
    // Breaks is part of the board's furniture, not a timeline you can remove.
    if (isBreakTrack(this.trackFor(index).name)) return;
    const track = this.state.tracks[index];
    const removedTasks = this.state.tasks.filter((t) => t.lane === index);
    const removedIds = removedTasks.map((t) => t.id);
    const tracks = this.state.tracks.filter((_, i) => i !== index);
    const tasks = this.state.tasks
      .filter((t) => t.lane !== index)
      .map((t) => (t.lane > index ? { ...t, lane: t.lane - 1 } : t))
      .map((t) => ({ ...t, parentIds: (t.parentIds || []).filter((pid) => !removedIds.includes(pid)) }));
    const entry = {
      id: track.id,
      name: track.name,
      color: track.color,
      tagIds: track.tagIds || [],
      tasks: removedTasks.map((t) => ({ ...t })),
      deletedAt: Date.now(),
    };
    const deletedTracks = [entry, ...this.state.deletedTracks];
    // Drop any divider anchored to the track that's leaving the board.
    const dividers = this.state.dividers.filter((d) => d.afterTrackId !== track.id);
    this.setState({ selection: this.state.selection.filter((id) => !removedIds.includes(id)) });
    this.persist(tasks, tracks, null, deletedTracks, dividers);
  }

  // Insert a divider after the lane whose track id is afterTrackId (one per
  // boundary). Undoable + persisted via the normal persist() path.
  addDivider(afterTrackId) {
    if (this.state.dividers.some((d) => d.afterTrackId === afterTrackId)) return;
    const divider = {
      id: 'dv' + Date.now() + Math.floor(Math.random() * 9999),
      afterTrackId,
    };
    this.persist(null, null, null, null, [...this.state.dividers, divider]);
  }

  removeDivider(id) {
    this.persist(null, null, null, null, this.state.dividers.filter((d) => d.id !== id));
  }

  // Bring an archived track back as a new (last) lane with its tasks intact.
  restoreTrack(id) {
    const entry = this.state.deletedTracks.find((d) => d.id === id);
    if (!entry) return;
    const deletedTracks = this.state.deletedTracks.filter((d) => d.id !== id);
    const newLane = this.state.tracks.length;
    const track = { id: entry.id, name: entry.name, color: entry.color, tagIds: entry.tagIds || [] };
    const tracks = [...this.state.tracks, track];
    const liveIds = new Set(this.state.tasks.map((t) => t.id));
    const restored = (entry.tasks || []).map((t) => ({
      ...t,
      lane: newLane,
      // Drop dangling parent refs to tasks that no longer exist.
      parentIds: (t.parentIds || []).filter((pid) => liveIds.has(pid) || entry.tasks.some((x) => x.id === pid)),
    }));
    const tasks = [...this.state.tasks, ...restored];
    this.persist(tasks, tracks, null, deletedTracks);
  }

  // Remove an archived track from the archive permanently.
  purgeDeletedTrack(id) {
    const deletedTracks = this.state.deletedTracks.filter((d) => d.id !== id);
    this.persist(null, null, null, deletedTracks);
  }

  // --- Backlog actions (#96) -------------------------------------------------

  // The lane a backlog entry should land on: its original track if it's still on
  // the board, else the first lane (the entry keeps its old track name as a hint).
  laneForBacklogEntry(entry) {
    const i = this.state.tracks.findIndex((tr) => tr.id === entry.trackId);
    return i >= 0 ? i : 0;
  }

  // Pull one backlog entry back onto today's board, starting at the next 10-min
  // boundary at/after now (same placement rule as the per-lane "pull overdue"
  // button), keeping its duration, notes and done state. Undoable.
  restoreFromBacklog(id) {
    const entry = this.state.backlog.find((b) => b.id === id);
    if (!entry) return;
    const nextSlot = Math.ceil(minutesSince(this.state.originMs) / SNAP_MIN) * SNAP_MIN;
    const start = Math.max(0, Math.min(MAX_START, nextSlot));
    const { startMs, trackId, trackName, trackColor, backloggedAt, ...task } = entry;
    const restored = {
      ...task,
      lane: this.laneForBacklogEntry(entry),
      start,
      duration: Math.max(SNAP_MIN, Math.min(LAYOUT.totalMin - start, entry.duration || SNAP_MIN)),
      parentIds: [],
    };
    this.persist(
      [...this.state.tasks, restored],
      null,
      null,
      null,
      null,
      this.state.backlog.filter((b) => b.id !== id),
    );
  }

  // Restore everything in the backlog in one step. Entries are laid end-to-end
  // from the next slot within each lane so they don't all stack on one minute.
  restoreAllFromBacklog() {
    if (!this.state.backlog.length) return;
    const nextSlot = Math.ceil(minutesSince(this.state.originMs) / SNAP_MIN) * SNAP_MIN;
    const cursorByLane = {};
    const restored = this.sortBacklog(this.state.backlog.filter((b) => !b.done))
      .slice()
      .reverse()
      .map((entry) => {
        const lane = this.laneForBacklogEntry(entry);
        const at = cursorByLane[lane] ?? nextSlot;
        const start = Math.max(0, Math.min(MAX_START, at));
        const duration = Math.max(
          SNAP_MIN,
          Math.min(LAYOUT.totalMin - start, entry.duration || SNAP_MIN),
        );
        cursorByLane[lane] = start + duration;
        const { startMs, trackId, trackName, trackColor, backloggedAt, ...task } = entry;
        return { ...task, lane, start, duration, parentIds: [] };
      });
    // Finished entries never surface in the backlog UI, so keep them untouched.
    this.persist([...this.state.tasks, ...restored], null, null, null, null, this.state.backlog.filter((b) => b.done));
  }

  dropFromBacklog(id) {
    this.persist(null, null, null, null, null, this.state.backlog.filter((b) => b.id !== id));
  }

  clearBacklog() {
    if (!this.state.backlog.length) return;
    this.persist(null, null, null, null, null, []);
  }

  // Manually send a board task to the backlog (card menu / detail panel), for
  // work that's being deferred rather than having aged out on its own. An
  // edge-to-edge attached chain moves as a unit: deferring any member sends the
  // whole linked block, so the group stays together in the backlog just as it
  // does on the board. Seams the user manually unlinked aren't part of the chain
  // (chainTaskIds honors seamDetached), so only genuinely-attached neighbors go.
  sendToBacklog(id) {
    const task = this.state.tasks.find((t) => t.id === id);
    if (!task) return;
    const ids = this.chainTaskIds(id); // Set of the whole attached block
    const moving = this.state.tasks.filter((t) => ids.has(t.id));
    const entries = moving.map((t) =>
      this.toBacklogEntry(t, this.state.tracks, this.state.originMs),
    );
    const tasks = this.state.tasks
      .filter((t) => !ids.has(t.id))
      .map((t) => ({
        ...t,
        parentIds: (t.parentIds || []).filter((pid) => !ids.has(pid)),
      }));
    if (ids.has(this.state.panelTaskId)) this.setState({ panelTaskId: null });
    this.setState({ selection: this.state.selection.filter((s) => !ids.has(s)) });
    this.persist(
      tasks,
      null,
      null,
      null,
      null,
      this.sortBacklog([...this.state.backlog, ...entries]),
    );
  }

  // ── Pomodoro ──────────────────────────────────────────────────────────────
  // The Pomodoro ENGINE lives here (not in PomodoroPanel) so it keeps running
  // and stays visible via the floating board chip even when the panel is closed.
  // The panel is now a pure view/controller over this state.
  togglePomodoro() {
    this.setState((s) => ({ pomodoroOpen: !s.pomodoroOpen }));
  }

  // Persist the current engine snapshot to localStorage (via lib/pomodoro), so a
  // reload continues the countdown. `focusTaskId` rides along so the binding
  // survives too.
  persistPomo(pomo = this.state.pomo, focusTaskId = this.state.focusTaskId) {
    savePomodoro({
      phase: pomo.phase,
      running: pomo.running,
      endsAt: pomo.endsAt,
      remainingMs: pomo.remainingMs,
      completedFocus: pomo.completedFocus,
      focusTaskId,
      config: pomo.config,
      tally: pomo.tally,
    });
  }

  // The 250ms tick. Absolute endsAt means each tick just recomputes the delta,
  // so drift and tab-throttling can't accumulate. Started in componentDidMount,
  // runs for the app's lifetime; it's a no-op while paused.
  pomoTick() {
    const { pomo } = this.state;
    if (!pomo.running) return;
    const left = Math.max(0, (pomo.endsAt || 0) - Date.now());
    if (left <= 0) {
      this.pomoHandlePhaseEnd();
    } else {
      this.setState({ pomo: { ...pomo, remainingMs: left } }, () => this.updatePomoTitle());
    }
  }

  // Live countdown in the browser tab title, e.g. "24:59 · Focus". Restored to
  // the plain app title when the timer isn't running.
  updatePomoTitle() {
    const { pomo } = this.state;
    if (pomo.running) {
      document.title = mmss(pomo.remainingMs / 1000) + ' · ' + PHASES[pomo.phase].label;
    } else if (this._pomoBaseTitle != null) {
      document.title = this._pomoBaseTitle;
    }
  }

  // Start or pause the current phase. This is what the header chip / board chip /
  // panel button all call — click to pause, click again to resume.
  pomoStartPause() {
    const { pomo } = this.state;
    if (this._pomoBaseTitle == null) this._pomoBaseTitle = document.title;
    if (pomo.running) {
      // Pause: freeze the remaining time.
      const left = Math.max(0, (pomo.endsAt || 0) - Date.now());
      const next = { ...pomo, running: false, endsAt: null, remainingMs: left };
      this.setState({ pomo: next }, () => {
        this.persistPomo(next);
        this.updatePomoTitle();
      });
    } else {
      if (pomo.config.notify) this.requestNotifyPermission();
      const len = pomo.remainingMs > 0 ? pomo.remainingMs : phaseLengthMin(pomo.config, pomo.phase) * 60000;
      const next = { ...pomo, running: true, endsAt: Date.now() + len, remainingMs: len };
      this.setState({ pomo: next }, () => {
        this.persistPomo(next);
        this.updatePomoTitle();
      });
    }
  }

  pomoReset() {
    const { pomo } = this.state;
    const len = phaseLengthMin(pomo.config, pomo.phase) * 60000;
    const next = { ...pomo, running: false, endsAt: null, remainingMs: len };
    this.setState({ pomo: next }, () => {
      this.persistPomo(next);
      this.updatePomoTitle();
    });
  }

  // Switch to a specific phase (from the panel's phase tabs), optionally
  // auto-starting it.
  pomoSwitchPhase(nextKey, autoStart) {
    const { pomo } = this.state;
    const len = phaseLengthMin(pomo.config, nextKey) * 60000;
    const next = autoStart
      ? { ...pomo, phase: nextKey, running: true, endsAt: Date.now() + len, remainingMs: len }
      : { ...pomo, phase: nextKey, running: false, endsAt: null, remainingMs: len };
    this.setState({ pomo: next }, () => {
      this.persistPomo(next);
      this.updatePomoTitle();
    });
  }

  // A phase's clock hit zero. Tally + log focus sessions, chime/notify, then
  // advance to the next phase (auto-starting if configured).
  pomoHandlePhaseEnd() {
    const { pomo } = this.state;
    const finished = pomo.phase;
    let completedFocus = pomo.completedFocus;
    let tally = pomo.tally;

    if (finished === 'focus') {
      completedFocus += 1;
      const today = dayKey();
      tally = { day: today, count: (tally.day === today ? tally.count : 0) + 1 };
      if (this.state.focusTaskId) this.logFocusSession(this.state.focusTaskId, pomo.config.focusMin);
    }

    if (pomo.config.chime) playChime();
    if (pomo.config.notify) {
      pomoNotify(
        finished === 'focus' ? '🍅 Focus complete' : 'Break over',
        finished === 'focus' ? 'Nice work — time for a break.' : 'Back to it.',
      );
    }

    const upcoming = nextPhase(finished, completedFocus, pomo.config);
    const len = phaseLengthMin(pomo.config, upcoming) * 60000;
    // The timer NEVER advances into the next phase on its own — the user starts
    // every phase manually (focus -> break -> focus). We load the next phase's
    // clock but leave it paused; pressing start begins it.
    const autoStart = false;
    const next = {
      ...pomo,
      completedFocus,
      tally,
      phase: upcoming,
      running: autoStart,
      endsAt: autoStart ? Date.now() + len : null,
      remainingMs: len,
    };
    this.setState({ pomo: next }, () => {
      this.persistPomo(next);
      this.updatePomoTitle();
    });
  }

  // Panel settings edits. If the edited duration is the current, idle phase,
  // reflect it on the clock immediately.
  pomoUpdateConfig(key, value) {
    const { pomo } = this.state;
    const config = { ...pomo.config, [key]: value };
    let remainingMs = pomo.remainingMs;
    if (!pomo.running) {
      const map = { focusMin: 'focus', shortMin: 'short', longMin: 'long' };
      if (map[key] === pomo.phase) remainingMs = value * 60000;
    }
    const next = { ...pomo, config, remainingMs };
    this.setState({ pomo: next }, () => {
      if (key === 'notify' && value) this.requestNotifyPermission();
      this.persistPomo(next);
    });
  }

  requestNotifyPermission() {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Bind (or clear) the task the Pomodoro is focusing on. Kept in board state
  // (not the timer's localStorage) because the board needs it to draw the pulse.
  setFocusTask(id) {
    this.setState({ focusTaskId: id || null }, () => this.persistPomo());
  }

  // Append a timestamped focus record to a task's notes when a focus session
  // finishes, so time actually spent shows up on the task itself. Written
  // straight through persist() (undoable, saved) like any other notes edit.
  logFocusSession(taskId, minutes) {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const when = fmtDateTime(Date.now(), this.props.timeFormat) || '';
    const line = '🍅 ' + minutes + 'm focus — ' + when;
    const notes = task.notes && task.notes.trim() ? task.notes.replace(/\s+$/, '') + '\n' + line : line;
    const tasks = this.state.tasks.map((t) => (t.id === taskId ? { ...t, notes } : t));
    this.persist(tasks);
  }

  // Manual "this task is a Claude session" flag (clay outline on the card).
  // Toggled from the small sparkle button at the card's bottom-right corner.
  toggleClaudeSession(id) {
    const tasks = this.state.tasks.map((t) => (t.id === id ? { ...t, claudeSession: !t.claudeSession } : t));
    this.persist(tasks);
  }

  // ── To-do list ────────────────────────────────────────────────────────────
  openTodoPanel() {
    this.setState({ todoPanelOpen: !this.state.todoPanelOpen, panelTaskId: null, backlogTrackId: null });
  }

  closeTodoPanel() {
    if (this.state.todoPanelOpen) this.setState({ todoPanelOpen: false });
  }

  // Add a to-do, optionally under a parent (capped at MAX_TODO_DEPTH via the
  // panel, which hides the action at the last level).
  addTodo(parentId, afterId) {
    // Created blank and handed straight to the panel's inline editor, so typing
    // starts immediately (the panel focuses whatever id lands in todoDraftId).
    const todo = { id: genTodoId(), title: '', notes: '', parentId: parentId || null, done: false, taskId: null, createdAt: Date.now() };
    const todos = this.state.todos.slice();
    if (afterId) {
      // "Enter" from another row: drop the new task right below it.
      const ids = subtreeIds(todos, afterId);
      let at = -1;
      todos.forEach((t, i) => {
        if (ids.includes(t.id)) at = i;
      });
      todos.splice(at + 1, 0, todo);
    } else if (parentId) {
      // Drop it after the parent's existing subtree so it lands inside the group.
      const ids = subtreeIds(todos, parentId);
      let at = -1;
      todos.forEach((t, i) => {
        if (ids.includes(t.id)) at = i;
      });
      todos.splice(at + 1, 0, todo);
    } else {
      todos.push(todo);
    }
    this.setState({ todoDraftId: todo.id });
    this.persist(null, null, null, null, null, null, todos);
  }

  // Enter in the inline editor: save the name and open a blank sibling below,
  // in ONE state update (two persists would race and lose the rename).
  renameTodoAndAdd(id, title, parentId) {
    const clean = (title || '').trim();
    if (!clean) return this.setTodoTitle(id, title);
    const cur = this.state.todos.find((t) => t.id === id);
    let todos = this.state.todos.map((t) => (t.id === id ? { ...t, title: clean } : t));
    const fresh = { id: genTodoId(), title: '', notes: '', parentId: parentId || null, done: false, taskId: null, createdAt: Date.now() };
    const ids = subtreeIds(todos, id);
    let at = -1;
    todos.forEach((t, i) => {
      if (ids.includes(t.id)) at = i;
    });
    todos = todos.slice();
    todos.splice(at + 1, 0, fresh);
    const tasks = cur && cur.taskId ? this.state.tasks.map((t) => (t.id === cur.taskId ? { ...t, title: clean } : t)) : null;
    this.setState({ todoDraftId: fresh.id });
    this.persist(tasks, null, null, null, null, null, todos);
  }

  // Tab / Shift+Tab in the editor: make this to-do a child of the row above it,
  // or lift it out to its parent's level. The title being typed is saved first
  // so nothing is lost, and the caret stays in the row.
  indentTodo(id, dir, title) {
    const list = this.state.todos;
    const cur = list.find((t) => t.id === id);
    if (!cur) return;
    const clean = (title || '').trim();
    let todos = clean && clean !== cur.title ? list.map((t) => (t.id === id ? { ...t, title: clean } : t)) : list.slice();
    const moving = todos.find((t) => t.id === id);
    const ids = subtreeIds(todos, id);

    let newParentId;
    if (dir > 0) {
      // The nearest task above it at the same level becomes its parent.
      const siblings = todos.filter((t) => (t.parentId || null) === (moving.parentId || null));
      const at = siblings.findIndex((t) => t.id === id);
      if (at <= 0) return;
      const above = siblings[at - 1];
      // Respect the depth cap for the whole subtree being moved.
      const parentDepth = depthOf(todos, above) + 1;
      const deepest = ids.reduce((m, tid) => {
        const t = todos.find((x) => x.id === tid);
        return Math.max(m, depthOf(todos, t) - depthOf(todos, moving));
      }, 0);
      if (parentDepth + deepest + 1 > MAX_TODO_DEPTH) return;
      newParentId = above.id;
    } else {
      if (!moving.parentId) return; // already at the top level
      const parent = todos.find((t) => t.id === moving.parentId);
      newParentId = parent ? parent.parentId || null : null;
    }

    const block = todos.filter((t) => ids.includes(t.id)).map((t) => (t.id === id ? { ...t, parentId: newParentId } : t));
    const rest = todos.filter((t) => !ids.includes(t.id));
    // Re-insert after the new parent's subtree (indent) or after the old parent's (outdent).
    const anchor = dir > 0 ? newParentId : moving.parentId;
    const anchorIds = anchor ? subtreeIds(rest, anchor) : [];
    let at = -1;
    rest.forEach((t, i) => {
      if (anchorIds.includes(t.id)) at = i;
    });
    rest.splice(at + 1, 0, ...block);
    this.setState({ todoDraftId: id });
    this.persist(null, null, null, null, null, null, rest);
  }

  // Saving an empty name throws the row away (nothing half-created is left).
  setTodoTitle(id, title) {
    const clean = (title || '').trim();
    const cur = this.state.todos.find((t) => t.id === id);
    if (!cur) return;
    if (!clean) {
      if (!cur.title && !childrenOf(this.state.todos, cur.id).length) this.removeTodo(id);
      return;
    }
    if (clean === cur.title) return;
    const todos = this.state.todos.map((t) => (t.id === id ? { ...t, title: clean } : t));
    // A linked board task carries the same name.
    const tasks = cur.taskId ? this.state.tasks.map((t) => (t.id === cur.taskId ? { ...t, title: clean } : t)) : null;
    this.persist(tasks, null, null, null, null, null, todos);
  }

  setTodoNotes(id, notes) {
    const cur = this.state.todos.find((t) => t.id === id);
    if (!cur || (cur.notes || '') === (notes || '')) return;
    const todos = this.state.todos.map((t) => (t.id === id ? { ...t, notes } : t));
    // One note, two views: the linked board task shows the same text.
    const tasks = cur.taskId ? this.state.tasks.map((t) => (t.id === cur.taskId ? { ...t, notes } : t)) : null;
    this.persist(tasks, null, null, null, null, null, todos);
  }

  // Ticking a to-do marks its board task done as well (and the reverse lives in
  // toggleDone). Ticking a parent ticks everything under it.
  toggleTodoDone(id) {
    const cur = this.state.todos.find((t) => t.id === id);
    if (!cur) return;
    const next = !cur.done;
    const ids = subtreeIds(this.state.todos, id);
    const todos = this.state.todos.map((t) => (ids.includes(t.id) ? { ...t, done: next } : t));
    const linked = new Set(todos.filter((t) => ids.includes(t.id) && t.taskId).map((t) => t.taskId));
    const tasks = linked.size
      ? this.state.tasks.map((t) =>
          linked.has(t.id) ? { ...t, done: next, completedAt: next ? t.completedAt || Date.now() : null } : t,
        )
      : null;
    this.persist(tasks, null, null, null, null, null, todos);
  }

  // Soft delete: stamp the subtree with deletedAt and keep the rows in `todos`
  // (so the row count never drops — the disk-regression guard treats a shrink as
  // data loss and would refuse the write). Deleted rows are hidden from the live
  // list and can be restored from the Deleted bin until the weekly purge.
  removeTodo(id) {
    const ids = subtreeIds(this.state.todos, id);
    const now = Date.now();
    const todos = this.state.todos.map((t) => (ids.includes(t.id) ? { ...t, deletedAt: now } : t));
    this.persist(null, null, null, null, null, null, todos);
  }

  // Bring a soft-deleted to-do (and its subtree) back to the live list.
  restoreTodo(id) {
    const ids = subtreeIds(this.state.todos, id);
    const todos = this.state.todos.map((t) => (ids.includes(t.id) ? { ...t, deletedAt: null } : t));
    this.persist(null, null, null, null, null, null, todos);
  }

  // Weekly cleanup: permanently drop to-dos deleted more than 7 days ago. Runs
  // once after hydration; the row-count drop here is legitimate and goes out on
  // a normal baseRev'd save, which the regression guard doesn't gate.
  purgeDeletedTodos() {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const stale = this.state.todos.some((t) => t.deletedAt && t.deletedAt < cutoff);
    if (!stale) return;
    const todos = this.state.todos.filter((t) => !(t.deletedAt && t.deletedAt < cutoff));
    this.persist(null, null, null, null, null, null, todos);
  }

  // Drag-reorder: move a to-do (with its subtree) in front of the target row.
  //
  // A root to-do (no parentId) always STAYS a root — it can only be reordered
  // among the other roots, never nested inside one. So when a root is dragged we
  // keep parentId=null and snap the insertion point to the target's own root, so
  // the moved block lands cleanly before that whole group rather than in the
  // middle of it. A non-root drag keeps the old behaviour: it adopts the
  // target's parent, so dropping inside a group joins that group.
  reorderTodo(dragId, targetId) {
    if (!dragId || dragId === targetId) return;
    const all = this.state.todos;
    const ids = subtreeIds(all, dragId);
    if (ids.includes(targetId)) return; // never drop a task inside itself
    const dragging = all.find((t) => t.id === dragId);
    const target = all.find((t) => t.id === targetId);
    if (!dragging || !target) return;
    const dragIsRoot = !dragging.parentId;

    // The row we insert before. For a root drag, resolve the target up to its
    // root so we don't wedge the block between a group head and its children.
    let anchorId = targetId;
    let newParentId = target.parentId || null;
    if (dragIsRoot) {
      let root = target;
      while (root && root.parentId) root = all.find((t) => t.id === root.parentId) || null;
      anchorId = root ? root.id : targetId;
      newParentId = null;
    }

    const moving = all.filter((t) => ids.includes(t.id));
    const rest = all.filter((t) => !ids.includes(t.id));
    const at = rest.findIndex((t) => t.id === anchorId);
    const reparented = moving.map((t) => (t.id === dragId ? { ...t, parentId: newParentId } : t));
    rest.splice(at < 0 ? rest.length : at, 0, ...reparented);
    this.persist(null, null, null, null, null, null, rest);
  }

  // Put a to-do on a track: lands at that lane's cursor (now's next slot, then
  // after whatever is already chained there), 30 minutes long, notes carried.
  addTodoToTrack(todoId, laneIndex) {
    const todo = this.state.todos.find((t) => t.id === todoId);
    if (!todo || todo.taskId) return;
    const lane = Math.max(0, Math.min(this.state.tracks.length - 1, laneIndex));
    const start = this.backlogCursor(lane, TODO_MINUTES);
    const task = {
      id: 'id' + Date.now() + Math.floor(Math.random() * 999),
      title: todo.title,
      notes: todo.notes || '',
      lane,
      start,
      duration: Math.max(SNAP_MIN, Math.min(LAYOUT.totalMin - start, TODO_MINUTES)),
      done: !!todo.done,
      parentIds: [],
      todoId: todo.id,
    };
    const todos = this.state.todos.map((t) => (t.id === todoId ? { ...t, taskId: task.id } : t));
    this.persist([...this.state.tasks, task], null, null, null, null, null, todos);
  }

  // Any board task that leaves the board frees its to-do again.
  unlinkTodosFor(taskIds, todos) {
    const ids = new Set(taskIds);
    const list = todos || this.state.todos;
    if (!list.some((t) => t.taskId && ids.has(t.taskId))) return list;
    return list.map((t) => (t.taskId && ids.has(t.taskId) ? { ...t, taskId: null } : t));
  }

  // ── Per-track backlog panel ───────────────────────────────────────────────
  // Entries for one track, most recently pushed first.
  trackBacklog(trackId) {
    return this.state.backlog
      .filter((b) => b.trackId === trackId && !b.done)
      .sort((a, b) => (b.backloggedAt || 0) - (a.backloggedAt || 0));
  }

  openBacklogPanel(trackId) {
    if (this.state.backlogTrackId === trackId) return this.closeBacklogPanel();
    this.setState({ backlogTrackId: trackId, backlogHoverId: null, panelTaskId: null, todoPanelOpen: false });
  }

  closeBacklogPanel() {
    if (this.state.backlogTrackId) this.setState({ backlogTrackId: null, backlogHoverId: null });
  }

  // Where the next task pulled into `lane` lands: start at now's next 10-min
  // slot, walk to the end of whatever already occupies/touches that point, and
  // jump past any later task a `duration`-long card would collide with. So
  // pulls chain end-to-end: 1st at now, 2nd after the 1st, 3rd after the 2nd…
  backlogCursor(lane, duration, tasks) {
    const list = (tasks || this.state.tasks).filter((t) => t.lane === lane);
    let c = Math.ceil(minutesSince(this.state.originMs) / SNAP_MIN) * SNAP_MIN;
    c = Math.max(0, c);
    let moved = true;
    let guard = 0;
    while (moved && guard++ < 500) {
      moved = false;
      for (const t of list) {
        const end = t.start + t.duration;
        const overlapsCursor = t.start <= c && end > c;
        const blocksCard = t.start >= c && t.start < c + duration;
        if (overlapsCursor || blocksCard) {
          c = end;
          moved = true;
        }
      }
    }
    return Math.min(MAX_START, c);
  }

  backlogEntryToTask(entry, lane, start) {
    const { startMs, trackId, trackName, trackColor, backloggedAt, ...task } = entry;
    return {
      ...task,
      lane,
      start,
      duration: Math.max(SNAP_MIN, Math.min(LAYOUT.totalMin - start, entry.duration || SNAP_MIN)),
      parentIds: [],
    };
  }

  // Pull one entry onto the board at its track's cursor. Undoable (persist).
  pullFromTrackBacklog(id) {
    const entry = this.state.backlog.find((b) => b.id === id);
    if (!entry) return;
    const lane = this.laneForBacklogEntry(entry);
    const start = this.backlogCursor(lane, entry.duration || SNAP_MIN);
    const task = this.backlogEntryToTask(entry, lane, start);
    this.setState({ backlogHoverId: null });
    this.persist(
      [...this.state.tasks, task],
      null,
      null,
      null,
      null,
      this.state.backlog.filter((b) => b.id !== id),
    );
  }

  // Pull every entry of a track, in panel order, chained end-to-end.
  pullAllFromTrackBacklog(trackId) {
    const entries = this.trackBacklog(trackId);
    if (!entries.length) return;
    const ids = new Set(entries.map((b) => b.id));
    let tasks = this.state.tasks.slice();
    entries.forEach((entry) => {
      const lane = this.laneForBacklogEntry(entry);
      const start = this.backlogCursor(lane, entry.duration || SNAP_MIN, tasks);
      tasks = [...tasks, this.backlogEntryToTask(entry, lane, start)];
    });
    this.setState({ backlogHoverId: null });
    this.persist(tasks, null, null, null, null, this.state.backlog.filter((b) => !ids.has(b.id)));
  }

  // A track drag can start anywhere on the row/pill (see onRowMouseDown). We
  // arm it on mousedown but only "pick up" the track once the pointer actually
  // moves past a small threshold, so a plain click (or a double-click for
  // rename) neither reorders nor flashes the drag styling.
  startTrackDrag(index, e) {
    if (e.button !== 0) return;
    // The Breaks lane is pinned to the top; it doesn't get picked up.
    if (isBreakTrack(this.trackFor(index).name)) return;
    e.preventDefault();
    this.setState({
      trackDrag: { index, overIndex: index, startY: e.clientY, startX: e.clientX, dy: 0, dx: 0, moved: false },
    });
    document.addEventListener('mousemove', this.onTrackDragMove);
    document.addEventListener('mouseup', this.onTrackDragUp);
  }

  onTrackDragMove(e) {
    const d = this.state.trackDrag;
    if (!d) return;
    const moved = d.moved || Math.abs(e.clientX - d.startX) > 3 || Math.abs(e.clientY - d.startY) > 3;
    if (!moved) return;
    const V = this.state.orientation === 'vertical';
    const delta = V ? e.clientX - d.startX : e.clientY - d.startY;
    const laneSize = this.laneCross();
    // Nothing may be dropped above the pinned Breaks lane.
    const floor = this.breakLane() === 0 ? 1 : 0;
    const overIndex = Math.max(
      floor,
      Math.min(this.state.tracks.length - 1, d.index + Math.round(delta / laneSize)),
    );
    this.setState({ trackDrag: { ...d, dy: e.clientY - d.startY, dx: e.clientX - d.startX, overIndex, moved: true } });
  }

  onTrackDragUp() {
    document.removeEventListener('mousemove', this.onTrackDragMove);
    document.removeEventListener('mouseup', this.onTrackDragUp);
    const d = this.state.trackDrag;
    if (d && d.moved && d.overIndex !== d.index) {
      const oldTracks = this.state.tracks;
      const tracks = oldTracks.slice();
      const [moved] = tracks.splice(d.index, 1);
      tracks.splice(d.overIndex, 0, moved);
      const newIndexById = {};
      tracks.forEach((t, i) => (newIndexById[t.id] = i));
      const tasks = this.state.tasks.map((t) => {
        const oldTrack = oldTracks[t.lane];
        const id = oldTrack ? oldTrack.id : null;
        const newLane = id != null && newIndexById[id] != null ? newIndexById[id] : t.lane;
        return { ...t, lane: newLane };
      });
      this.persist(tasks, tracks);
    }
    this.setState({ trackDrag: null });
  }

  // Track rename is now gated behind a double-click (single click/drag is
  // reserved for reorder). Entering edit makes the name contentEditable and the
  // TrackName component focuses + selects it.
  startTrackEdit(index) {
    this.setState({ editingTrack: index });
  }

  commitTrackEdit(index, text) {
    // Escape cancels without renaming (blur still fires afterwards).
    if (this._trackEditCancel) {
      this._trackEditCancel = false;
      this.setState({ editingTrack: null });
      return;
    }
    this.setState({ editingTrack: null });
    this.renameTrack(index, text);
  }

  startWire(taskId, side, e) {
    e.stopPropagation();
    e.preventDefault();
    const el = this.contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Track the press origin so mouseup can tell a clean click (two-click
    // connect) from a press-drag (the original drag-to-connect).
    this.setState({
      wiring: {
        sourceId: taskId,
        side,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
      },
    });
    document.addEventListener('mousemove', this.onWireMove);
    document.addEventListener('mouseup', this.onWireUp);
  }

  onWireMove(e) {
    const w = this.state.wiring;
    if (!w) return;
    const el = this.contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const moved =
      w.moved ||
      Math.abs(e.clientX - w.startClientX) > WIRE_DRAG_THRESHOLD ||
      Math.abs(e.clientY - w.startClientY) > WIRE_DRAG_THRESHOLD;
    this.setState({ wiring: { ...w, x: e.clientX - rect.left, y: e.clientY - rect.top, moved } });
  }

  onWireUp(e) {
    document.removeEventListener('mousemove', this.onWireMove);
    document.removeEventListener('mouseup', this.onWireUp);
    const w = this.state.wiring;
    this.setState({ wiring: null });
    if (!w) return;
    if (w.moved) {
      // Original drag-to-connect: whatever dot we release over becomes the
      // dependent (child) of the dot we dragged from. A drag supersedes any
      // half-armed two-click connection.
      this.cancelPendingConnect();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const dotEl = el && el.closest('[data-dot]');
      // With a mouse you drop precisely on the other task's dot. With a finger
      // that's a 10px target mid-drag, so on touch devices dropping anywhere on
      // the target card connects it too.
      const cardEl = !dotEl && isCoarsePointer() && el && el.closest ? el.closest('.task-card') : null;
      const targetId = dotEl
        ? dotEl.getAttribute('data-task-id')
        : cardEl
          ? cardEl.getAttribute('data-task-id')
          : null;
      if (targetId && targetId !== w.sourceId) this.connectDep(w.sourceId, targetId);
      return;
    }
    // Clean click (no meaningful movement) => two-click connect gesture.
    const armed = this.state.pendingConnect;
    if (!armed) {
      this.armConnect(w.sourceId, w.side, e);
    } else if (armed.sourceId === w.sourceId) {
      // Clicking the same task's dot again cancels the pending connection.
      this.cancelPendingConnect();
    } else {
      this.connectDep(armed.sourceId, w.sourceId);
      this.cancelPendingConnect();
    }
  }

  // Arm a two-click connection from the just-clicked dot; a faint line then
  // follows the cursor until the second dot (or a cancel) is clicked.
  armConnect(sourceId, side, e) {
    const el = this.contentRef.current;
    const rect = el ? el.getBoundingClientRect() : null;
    this.setState({
      pendingConnect: {
        sourceId,
        side,
        x: rect ? e.clientX - rect.left : 0,
        y: rect ? e.clientY - rect.top : 0,
      },
    });
    document.addEventListener('mousemove', this.onPendingMove);
  }

  onPendingMove(e) {
    const p = this.state.pendingConnect;
    if (!p) return;
    const el = this.contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    this.setState({ pendingConnect: { ...p, x: e.clientX - rect.left, y: e.clientY - rect.top } });
  }

  cancelPendingConnect() {
    document.removeEventListener('mousemove', this.onPendingMove);
    if (this.state.pendingConnect) this.setState({ pendingConnect: null });
  }

  // Create a dependency: `targetId` (child) gains `sourceId` (parent). Shared by
  // both the drag and two-click connect flows; persisted + undoable.
  connectDep(sourceId, targetId) {
    if (!targetId || targetId === sourceId) return;
    const tasks = this.state.tasks.map((t) => {
      if (t.id !== targetId) return t;
      const pids = Array.isArray(t.parentIds) ? t.parentIds.slice() : [];
      if (!pids.includes(sourceId)) pids.push(sourceId);
      return { ...t, parentIds: pids };
    });
    this.persist(tasks);
  }

  // Remove a single dependency edge (child no longer depends on parent). Used by
  // click-to-delete on a connector line; persisted + undoable.
  deleteDependency(childId, parentId) {
    const tasks = this.state.tasks.map((t) =>
      t.id === childId
        ? { ...t, parentIds: (t.parentIds || []).filter((pid) => pid !== parentId) }
        : t,
    );
    this.persist(tasks);
  }

  // Instant create: a double-click on empty space drops a new 30-minute task
  // at that position/track immediately (no dialog), ready to drag/resize.
  onBoardDblClick(e) {
    if (e.target.closest('[data-dot]') || e.target.closest('[data-task]')) return;
    const el = this.contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = this.timeDensity();
    const laneSize = this.laneCross();
    const V = this.state.orientation === 'vertical';
    const timeRaw = V ? e.clientY - rect.top : e.clientX - rect.left;
    const laneRaw = V ? e.clientX - rect.left : e.clientY - rect.top;
    let min = this.snapTime(timeRaw / px);
    min = Math.max(0, Math.min(MAX_START, min));
    const lane = Math.max(0, Math.min(this.state.tracks.length - 1, Math.floor(laneRaw / laneSize)));
    const task = {
      id: 'id' + Date.now() + Math.floor(Math.random() * 9999),
      title: 'New task',
      lane,
      start: min,
      duration: 30,
      done: false,
      parentIds: [],
      notes: '',
    };
    this.persist([...this.state.tasks, task]);
    // Immediately enter inline rename on the fresh task; Timeline's effect
    // focuses + selects-all the contenteditable on the next frame once its
    // DOM node exists (same machinery as double-click-to-rename).
    this.setState({ editingId: task.id, selection: [] });
  }

  jumpToNow(smooth) {
    // #96: if the board has drifted out of the present (a tab open past the end
    // of the window), re-anchor first and scroll on the next frame — otherwise
    // "Now" would scroll to a clamped edge instead of the current time.
    const nowOffset = minutesSince(this.state.originMs);
    if (nowOffset < 0 || nowOffset >= LAYOUT.totalMin) {
      if (this._reanchoring) return; // one-shot guard; never loop on a bad clock
      this._reanchoring = true;
      this.reanchorToToday(() => {
        this._reanchoring = false;
        requestAnimationFrame(() => this.jumpToNow(smooth));
      });
      return;
    }
    const px = this.timeDensity();
    const V = this.state.orientation === 'vertical';
    if (V) {
      // The now-line lives inside the content div, which sits below the sticky
      // track-header row (barSize) inside the scroll area. Depending on how the
      // browser resolves overflow, the vertical scroller can be either the
      // timeline's own scroll div or the outer board wrapper, so scroll
      // whichever one actually overflows.
      const barSize = LAYOUT.trackHeaderH;
      const nowPos = barSize + minutesSince(this.state.originMs) * px;
      const candidates = [this.scrollRef.current, this.boardRef.current];
      candidates.forEach((el) => {
        if (!el) return;
        if (el.scrollHeight <= el.clientHeight + 1) return;
        const target = Math.max(0, nowPos - el.clientHeight * 0.4);
        if (smooth === false) el.scrollTop = target;
        else el.scrollTo({ top: target, behavior: 'smooth' });
      });
    } else {
      const sc = this.scrollRef.current;
      if (!sc) return;
      const target = Math.max(0, minutesSince(this.state.originMs) * px - sc.clientWidth * 0.4);
      if (smooth === false) sc.scrollLeft = target;
      else sc.scrollTo({ left: target, behavior: 'smooth' });
    }
  }

  toggleOrientation() {
    const orientation = this.state.orientation === 'vertical' ? 'horizontal' : 'vertical';
    // Clear the transient scroll auto-hide so the gutter isn't stuck collapsed
    // after switching axes; also reset the direction tracker.
    this._lastScrollLeft = 0;
    this.setState({ orientation, labelsAutoHidden: false });
    this.persistView({ orientation });
    requestAnimationFrame(() => requestAnimationFrame(() => this.jumpToNow(false)));
  }

  toggleSidebar() {
    const sidebarCollapsed = !this.state.sidebarCollapsed;
    this.setState({ sidebarCollapsed });
    this.persistView({ sidebarCollapsed });
  }

  // Touch handle on phones: whatever hid the labels (the pinned flag or the
  // scroll auto-hide), one tap brings them back and the next tap hides them.
  toggleTrackGutter() {
    const hidden = this.state.sidebarCollapsed || this.state.labelsAutoHidden;
    this.setState({ sidebarCollapsed: !hidden, labelsAutoHidden: false });
    this.persistView({ sidebarCollapsed: !hidden });
  }

  startSidebarResize(e) {
    e.preventDefault();
    this.setState({ sidebarResizing: { startX: e.clientX, startWidth: this.state.sidebarWidth } });
    document.addEventListener('mousemove', this.onSidebarResizeMove);
    document.addEventListener('mouseup', this.onSidebarResizeUp);
  }

  onSidebarResizeMove(e) {
    const r = this.state.sidebarResizing;
    if (!r) return;
    const w = Math.max(90, Math.min(360, r.startWidth + (e.clientX - r.startX)));
    this.setState({ sidebarWidth: w });
  }

  onSidebarResizeUp() {
    document.removeEventListener('mousemove', this.onSidebarResizeMove);
    document.removeEventListener('mouseup', this.onSidebarResizeUp);
    this.setState({ sidebarResizing: null });
    this.persistView({ sidebarWidth: this.state.sidebarWidth });
  }

  // Detail panel is docked to the right, so its inner (left) edge is the resize
  // handle: dragging left widens it, dragging right narrows it.
  startPanelResize(e) {
    e.preventDefault();
    e.stopPropagation();
    this.setState({ panelResizing: { startX: e.clientX, startWidth: this.state.panelWidth } });
    document.addEventListener('mousemove', this.onPanelResizeMove);
    document.addEventListener('mouseup', this.onPanelResizeUp);
  }

  onPanelResizeMove(e) {
    const r = this.state.panelResizing;
    if (!r) return;
    const maxW = Math.round((typeof window !== 'undefined' ? window.innerWidth : 1200) * 0.7);
    const w = Math.max(280, Math.min(maxW, r.startWidth - (e.clientX - r.startX)));
    this.setState({ panelWidth: w });
  }

  onPanelResizeUp() {
    document.removeEventListener('mousemove', this.onPanelResizeMove);
    document.removeEventListener('mouseup', this.onPanelResizeUp);
    this.setState({ panelResizing: null });
    this.persistView({ panelWidth: this.state.panelWidth });
  }

  // ---- Shared drag/select infrastructure (content-coordinate based) ----

  snapTime(m) {
    return Math.round(m / SNAP_MIN) * SNAP_MIN;
  }

  pointerToContent(clientX, clientY) {
    const el = this.contentRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const px = this.timeDensity();
    const laneSize = this.laneCross();
    const V = this.state.orientation === 'vertical';
    const timeRaw = V ? clientY - rect.top : clientX - rect.left;
    const laneRaw = V ? clientX - rect.left : clientY - rect.top;
    return { time: timeRaw / px, laneFloat: laneRaw / laneSize };
  }

  addBoardListeners() {
    if (this._boardListening) return;
    document.addEventListener('mousemove', this.onBoardPointerMove);
    document.addEventListener('mouseup', this.onBoardPointerUp);
    this._boardListening = true;
  }

  removeBoardListeners() {
    document.removeEventListener('mousemove', this.onBoardPointerMove);
    document.removeEventListener('mouseup', this.onBoardPointerUp);
    this._boardListening = false;
  }

  onBoardPointerMove(e) {
    this.dispatchMove(e.clientX, e.clientY);
  }

  dispatchMove(x, y) {
    const s = this.state;
    if (s.drag) this.updateSingleDrag(x, y);
    else if (s.groupDrag) this.updateGroupDrag(x, y);
    else if (s.resize) this.updateResize(x, y);
    else if (s.marquee) this.updateMarquee(x, y);
    if (s.drag || s.groupDrag || s.resize || s.marquee) this.scroller.update(x, y);
  }

  onScrollTick(x, y) {
    const s = this.state;
    if (s.drag) this.updateSingleDrag(x, y);
    else if (s.groupDrag) this.updateGroupDrag(x, y);
    else if (s.resize) this.updateResize(x, y);
    else if (s.marquee) this.updateMarquee(x, y);
  }

  onBoardPointerUp(e) {
    const s = this.state;
    this.scroller.stop();
    this.removeBoardListeners();
    if (s.drag) this.finishSingleDrag();
    else if (s.groupDrag) this.finishGroupDrag();
    else if (s.resize) this.finishResize();
    else if (s.marquee) this.finishMarquee();
  }

  // Marquee (rubber-band) selection on empty board.
  onBoardMouseDown(e) {
    if (e.button !== 0) return;
    const el = this.contentRef.current;
    if (!el) return;
    // Clicking empty space while renaming commits + exits (no marquee this
    // gesture); the board has no click handler so nothing else fires.
    if (this.state.editingId) {
      this.maybeExitInlineEdit();
      e.preventDefault();
      return;
    }
    // Clicking empty space cancels a pending two-click connection (no marquee
    // this gesture).
    if (this.state.pendingConnect) {
      this.cancelPendingConnect();
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    this.setState({
      marquee: { cx0: cx, cy0: cy, cx1: cx, cy1: cy, startClientX: e.clientX, startClientY: e.clientY, moved: false },
    });
    this.addBoardListeners();
  }

  updateMarquee(x, y) {
    const m = this.state.marquee;
    if (!m) return;
    const el = this.contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = x - rect.left;
    const cy = y - rect.top;
    const moved = m.moved || Math.abs(x - m.startClientX) > 3 || Math.abs(y - m.startClientY) > 3;
    this.setState({ marquee: { ...m, cx1: cx, cy1: cy, moved } });
  }

  finishMarquee() {
    const m = this.state.marquee;
    if (!m) return;
    if (!m.moved) {
      // A clean click on empty space clears selection and closes the panel.
      this.setState({ marquee: null, selection: [], panelTaskId: null });
      return;
    }
    const px = this.timeDensity();
    const laneSize = this.laneCross();
    const V = this.state.orientation === 'vertical';
    const l = Math.min(m.cx0, m.cx1);
    const r = Math.max(m.cx0, m.cx1);
    const t0 = Math.min(m.cy0, m.cy1);
    const b = Math.max(m.cy0, m.cy1);
    const sel = [];
    this.state.tasks.forEach((tk) => {
      const len = Math.max(tk.duration * px, 36);
      let left, top, w, h;
      if (V) {
        left = tk.lane * laneSize + 8;
        top = tk.start * px;
        w = laneSize - 16;
        h = len;
      } else {
        left = tk.start * px;
        top = tk.lane * laneSize + 8;
        w = len;
        h = laneSize - 16;
      }
      if (l <= left && t0 <= top && r >= left + w && b >= top + h) sel.push(tk.id);
    });
    // A marquee (multi-)selection isn't a single-task focus, so close the panel.
    this.setState({ marquee: null, selection: sel, panelTaskId: null });
  }

  // Card mousedown dispatcher: group-move when selected, else single drag.
  onCardMouseDown(task, e) {
    e.stopPropagation();
    if (e.button !== 0) return;
    // A mousedown on any card body while editing (clicks on the editable text
    // itself are stopped upstream) commits the rename and exits — this gesture
    // just closes the editor and doesn't also drag or select.
    if (this.state.editingId) {
      this.maybeExitInlineEdit();
      this._dragJustHappened = true; // swallow the trailing select click
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (this.state.selection.includes(task.id)) {
      this.startGroupDrag(e);
    } else {
      if (this.state.selection.length) this.setState({ selection: [] });
      this.startSingleDrag(task, e);
    }
  }

  // Whether the touching seam between two tasks has been MANUALLY detached by
  // the user (clicking the seam dot). Stored on the task object as
  // `detachedFrom: [otherId, ...]`; symmetric, so we check both sides. A detach
  // only means anything while the two still touch — once they separate the seam
  // no longer exists, so per the "re-touching re-links" rule the stale id is
  // simply ignored here (and pruned opportunistically on drag end).
  seamDetached(a, b) {
    return (
      (a.detachedFrom || []).includes(b.id) ||
      (b.detachedFrom || []).includes(a.id)
    );
  }

  // Two tasks are "attached" — and so move as one rigid block — when EITHER
  // relationship holds:
  //   1. They touch edge-to-edge in the SAME lane (one's end == the other's
  //      start). Edge-to-edge contact is itself an implicit dependency: the
  //      board marks it with the chain-link glyph on the seam, UNLESS the user
  //      has manually detached that seam (seamDetached) — a detach lets them
  //      move individually while still touching, and clears once they separate.
  //   2. A dependency link connects them (parentIds), even across lanes — this
  //      is the line the user explicitly draws from one dot to another. An
  //      explicit link is never affected by seam detach.
  // Either condition alone is sufficient (they are OR'd, not AND'd).
  areChained(a, b) {
    if (!a || !b) return false;
    const linked =
      (b.parentIds || []).includes(a.id) || (a.parentIds || []).includes(b.id);
    if (linked) return true;
    if (a.lane !== b.lane) return false;
    const touching =
      a.start + a.duration === b.start || b.start + b.duration === a.start;
    if (!touching) return false;
    return !this.seamDetached(a, b);
  }

  // Toggle the manual detach on a touching seam between two tasks. Detaching
  // lets them move individually even while their edges meet; re-attaching makes
  // them move as one block again. Persisted (undoable) via persist().
  toggleSeamDetach(idA, idB) {
    const tasks = this.state.tasks.map((t) => {
      if (t.id !== idA && t.id !== idB) return t;
      const otherId = t.id === idA ? idB : idA;
      const cur = t.detachedFrom || [];
      const isDetached = cur.includes(otherId);
      const next = isDetached
        ? cur.filter((x) => x !== otherId)
        : [...cur, otherId];
      return { ...t, detachedFrom: next };
    });
    this.persist(tasks);
  }

  // The full set of task ids reachable from `startId` through end-to-end
  // attachments (a flood-fill in both directions). A lone task returns just
  // itself. Used to drag / push an attached chain as a single unit.
  chainTaskIds(startId) {
    const tasks = this.state.tasks;
    const byId = {};
    tasks.forEach((t) => (byId[t.id] = t));
    const seen = new Set([startId]);
    const stack = [startId];
    while (stack.length) {
      const cur = byId[stack.pop()];
      if (!cur) continue;
      for (const other of tasks) {
        if (seen.has(other.id)) continue;
        if (this.areChained(cur, other)) {
          seen.add(other.id);
          stack.push(other.id);
        }
      }
    }
    return seen;
  }

  startSingleDrag(task, e) {
    const p = this.pointerToContent(e.clientX, e.clientY);
    if (!p) return;
    // Grab the whole end-to-end chain this task belongs to (just itself if it
    // isn't chained). We record each member's original start + lane so the block
    // translates rigidly, preserving every adjacency and gap.
    const chain = this.chainTaskIds(task.id);
    const origStarts = {};
    const origLanes = {};
    this.state.tasks.forEach((t) => {
      if (chain.has(t.id)) {
        origStarts[t.id] = t.start;
        origLanes[t.id] = t.lane;
      }
    });
    this.setState({
      drag: {
        id: task.id,
        grabTime: p.time - task.start,
        grabLane: p.laneFloat - task.lane,
        startClientX: e.clientX,
        startClientY: e.clientY,
        curStart: task.start,
        curLane: task.lane,
        chain,
        origStarts,
        origLanes,
        moved: false,
      },
    });
    this.addBoardListeners();
  }

  updateSingleDrag(x, y) {
    const d = this.state.drag;
    if (!d) return;
    const p = this.pointerToContent(x, y);
    if (!p) return;
    // Desired position of the grabbed task, then clamp the WHOLE chain's rigid
    // translation so no member leaves [0, MAX_START] — the block stops together
    // at the edge instead of any one task piling up or detaching.
    const wantStart = this.snapTime(p.time - d.grabTime);
    const wantLane = Math.round(p.laneFloat - d.grabLane);
    const starts = Object.values(d.origStarts);
    const lanes = Object.values(d.origLanes);
    const minStart = Math.min(...starts);
    const maxStart = Math.max(...starts);
    const minLane = Math.min(...lanes);
    const maxLane = Math.max(...lanes);
    let deltaTime = wantStart - d.origStarts[d.id];
    deltaTime = Math.max(-minStart, Math.min(MAX_START - maxStart, deltaTime));
    let deltaLane = wantLane - d.origLanes[d.id];
    deltaLane = Math.max(-minLane, Math.min(this.state.tracks.length - 1 - maxLane, deltaLane));
    const moved = d.moved || Math.abs(x - d.startClientX) > 3 || Math.abs(y - d.startClientY) > 3;
    this.setState({
      drag: {
        ...d,
        curStart: d.origStarts[d.id] + deltaTime,
        curLane: d.origLanes[d.id] + deltaLane,
        deltaTime,
        deltaLane,
        moved,
      },
    });
  }

  finishSingleDrag() {
    const d = this.state.drag;
    if (d && d.moved) {
      this._dragJustHappened = true;
      const dt = d.deltaTime || 0;
      const dl = d.deltaLane || 0;
      const moved = this.state.tasks.map((t) =>
        d.chain && d.chain.has(t.id)
          ? { ...t, start: d.origStarts[t.id] + dt, lane: d.origLanes[t.id] + dl }
          : t,
      );
      // "Re-touching re-links": a manual seam detach only lasts while the two
      // tasks touch. Now that positions have settled, drop any detachedFrom id
      // whose seam is no longer in contact, so if they meet again later they
      // attach again (and the stale id can't suppress a fresh contact).
      this.persist(this.pruneStaleDetachments(moved));
    }
    this.setState({ drag: null });
  }

  // Remove detachedFrom ids for pairs that are no longer touching edge-to-edge
  // in the same lane. Keeps the detach override meaningful only while in contact.
  pruneStaleDetachments(tasks) {
    const byId = {};
    tasks.forEach((t) => (byId[t.id] = t));
    return tasks.map((t) => {
      if (!t.detachedFrom || t.detachedFrom.length === 0) return t;
      const kept = t.detachedFrom.filter((otherId) => {
        const o = byId[otherId];
        if (!o || o.lane !== t.lane) return false;
        return (
          t.start + t.duration === o.start || o.start + o.duration === t.start
        );
      });
      if (kept.length === t.detachedFrom.length) return t;
      return { ...t, detachedFrom: kept };
    });
  }

  startGroupDrag(e) {
    const p = this.pointerToContent(e.clientX, e.clientY);
    if (!p) return;
    const sel = new Set(this.state.selection);
    const orig = {};
    this.state.tasks.forEach((t) => {
      if (sel.has(t.id)) orig[t.id] = t.start;
    });
    this.setState({
      groupDrag: { anchorTime: p.time, orig, delta: 0, startClientX: e.clientX, startClientY: e.clientY, moved: false },
    });
    this.addBoardListeners();
  }

  updateGroupDrag(x, y) {
    const g = this.state.groupDrag;
    if (!g) return;
    const p = this.pointerToContent(x, y);
    if (!p) return;
    let delta = this.snapTime(p.time - g.anchorTime);
    const starts = Object.values(g.orig);
    if (starts.length) {
      const minS = Math.min(...starts);
      const maxS = Math.max(...starts);
      delta = Math.max(-minS, Math.min(MAX_START - maxS, delta));
    }
    const moved = g.moved || Math.abs(x - g.startClientX) > 3 || Math.abs(y - g.startClientY) > 3;
    this.setState({ groupDrag: { ...g, delta, moved } });
  }

  finishGroupDrag() {
    const g = this.state.groupDrag;
    if (g && g.moved) this._dragJustHappened = true;
    if (g && g.moved && g.delta !== 0) {
      const sel = new Set(this.state.selection);
      const tasks = this.state.tasks.map((t) =>
        sel.has(t.id) && g.orig[t.id] != null
          ? { ...t, start: Math.max(0, Math.min(MAX_START, g.orig[t.id] + g.delta)) }
          : t,
      );
      this.persist(tasks);
    }
    this.setState({ groupDrag: null });
  }

  startResize(task, edge, e) {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    this.setState({
      resize: {
        id: task.id,
        edge,
        startClientX: e.clientX,
        startClientY: e.clientY,
        curStart: task.start,
        curDuration: task.duration,
        moved: false,
      },
    });
    this.addBoardListeners();
  }

  updateResize(x, y) {
    const r = this.state.resize;
    if (!r) return;
    const p = this.pointerToContent(x, y);
    if (!p) return;
    const task = this.state.tasks.find((t) => t.id === r.id);
    if (!task) return;
    const moved = r.moved || Math.abs(x - r.startClientX) > 3 || Math.abs(y - r.startClientY) > 3;
    if (r.edge === 'start') {
      // Leading edge: END stays fixed; dragging changes `start` (duration
      // grows/shrinks by the same delta). Clamp start >= 0 and duration >= SNAP_MIN.
      const end = task.start + task.duration;
      let start = this.snapTime(p.time);
      start = Math.max(0, Math.min(end - SNAP_MIN, start));
      this.setState({ resize: { ...r, curStart: start, curDuration: end - start, moved } });
      return;
    }
    let dur = this.snapTime(p.time - task.start);
    dur = Math.max(SNAP_MIN, Math.min(LAYOUT.totalMin - task.start, dur));
    this.setState({ resize: { ...r, curDuration: dur, moved } });
  }

  finishResize() {
    const r = this.state.resize;
    if (r && r.moved) {
      this._dragJustHappened = true;
      const tasks = this.state.tasks.map((t) =>
        t.id === r.id
          ? r.edge === 'start'
            ? { ...t, start: r.curStart, duration: r.curDuration }
            : { ...t, duration: r.curDuration }
          : t,
      );
      this.persist(tasks);
    }
    this.setState({ resize: null });
  }

  toggleDone(task) {
    // Record when a task is completed (and clear it on reopen). Stays inside the
    // persist() path so completedAt saves to disk/localStorage and is undoable.
    const tasks = this.state.tasks.map((t) =>
      t.id === task.id
        ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null }
        : t,
    );
    const todos = task.todoId
      ? this.state.todos.map((t) => (t.id === task.todoId ? { ...t, done: !task.done } : t))
      : null;
    this.setState({ selection: this.state.selection.filter((id) => id !== task.id) });
    this.persist(tasks, null, null, null, null, null, todos);
  }

  // #89: id of the EARLIEST "missed" task in a lane, or null. A task is missed
  // when it's not done and its END (start + duration) is fully before `now`
  // (expressed as a minute offset from the absolute origin). Used both to pick
  // the task to pull and to enable/disable the per-lane pull button.
  earliestMissedTaskId(laneIndex, nowMinutes) {
    let best = null;
    for (const t of this.state.tasks) {
      if (t.lane !== laneIndex || t.done) continue;
      if (t.start + t.duration >= nowMinutes) continue; // not fully elapsed
      if (best === null || t.start < best.start) best = t;
    }
    return best ? best.id : null;
  }

  // #89b: the actual (clamped, on-canvas) forward shift the pull button would
  // apply to this lane — 0 when it would be a no-op. Single source of truth for
  // BOTH the button's enabled state (`hasMissed`) and the action itself, so the
  // two can never disagree. Returns 0 unless the lane has a fully-elapsed overdue
  // task AND the whole attached block still has room to move right on the canvas
  // (a member already pinned at MAX_START, e.g. late tomorrow, leaves no room —
  // which is exactly why the button used to show but do nothing).
  missedPullDelta(laneIndex, nowMinutes) {
    // No fully-elapsed overdue task in this lane => nothing to pull.
    if (this.earliestMissedTaskId(laneIndex, nowMinutes) == null) return 0;
    const laneTasks = this.state.tasks.filter((t) => t.lane === laneIndex && !t.done);
    if (laneTasks.length === 0) return 0;
    const ids = new Set();
    laneTasks.forEach((t) => this.chainTaskIds(t.id).forEach((id) => ids.add(id)));
    const moved = this.state.tasks.filter((t) => ids.has(t.id));
    const earliestStart = moved.reduce((m, t) => Math.min(m, t.start), Infinity);
    let delta = Math.ceil(nowMinutes / SNAP_MIN) * SNAP_MIN - earliestStart;
    const maxStart = moved.reduce((m, t) => Math.max(m, t.start), -Infinity);
    delta = Math.min(delta, MAX_START - maxStart);
    return delta > 0 ? delta : 0;
  }

  // #89b: pull a whole lane forward so its earliest not-done task lands at now,
  // in one click. The button only lights up when the lane has an overdue task
  // (earliestMissedTaskId), but the SHIFTED set = ALL not-done tasks in the lane
  // PLUS every task attached end-to-end to them (their full dependency chains,
  // even if a chain member sits in another lane) — so an attached block moves
  // together and its adjacencies stay intact. We translate that whole set rigidly
  // by `delta = ceil10(now) - earliestNotDoneStart`, so the earliest incomplete
  // task lands exactly on the next 10-min boundary at/after now while every
  // task's relative order, gaps and duration are preserved. Moving the future
  // tasks by the same delta is what prevents the pulled-forward tasks from
  // colliding with work already scheduled to the right of now. Done tasks stay in
  // the past. Absolute-origin model (minute offsets from originMs). Single undo
  // step, persisted via persist().
  pullMissedTask(laneIndex) {
    const now = minutesSince(this.state.originMs);
    // Same clamped delta the button uses to decide it's enabled, so a visible
    // button always does something and a no-op is never reachable here.
    const delta = this.missedPullDelta(laneIndex, now);
    if (delta <= 0) return;
    // Expand to the full chains so an attached dependency block moves as a unit.
    const laneTasks = this.state.tasks.filter((t) => t.lane === laneIndex && !t.done);
    const ids = new Set();
    laneTasks.forEach((t) => this.chainTaskIds(t.id).forEach((id) => ids.add(id)));
    const tasks = this.state.tasks.map((t) =>
      ids.has(t.id) ? { ...t, start: t.start + delta } : t,
    );
    this.persist(tasks);
  }

  // Detail-panel notes: goes through persist() so it saves to disk+localStorage
  // and is undoable, exactly like any other task edit.
  setTaskNotes(id, notes) {
    const cur = this.state.tasks.find((t) => t.id === id);
    if (!cur || (cur.notes || '') === (notes || '')) return;
    const tasks = this.state.tasks.map((t) => (t.id === id ? { ...t, notes } : t));
    this.persist(tasks);
  }

  // #90: persist an interactive to-do checkbox toggle — the rewritten note text
  // plus the restore snapshots (kept alongside the task, so they survive reload
  // via the same serialize/hydrate spread). Undoable through persist().
  setTaskTodo(id, notes, todoSnapshots) {
    const cur = this.state.tasks.find((t) => t.id === id);
    if (!cur) return;
    const tasks = this.state.tasks.map((t) =>
      t.id === id ? { ...t, notes, todoSnapshots } : t,
    );
    this.persist(tasks);
  }

  closePanel() {
    if (this.state.panelTaskId) this.setState({ panelTaskId: null });
  }

  // Rename a task by id (used by the detail-panel header). Reuses persist() so
  // it saves + is undoable, matching card inline rename.
  setTaskTitle(id, text) {
    const title = (text || '').trim() || 'Untitled';
    const cur = this.state.tasks.find((t) => t.id === id);
    if (!cur || cur.title === title) return;
    const tasks = this.state.tasks.map((t) => (t.id === id ? { ...t, title } : t));
    this.persist(tasks);
  }

  // Inline title editing (replaces the old modal).
  startInlineEdit(task) {
    this.setState({ editingId: task.id });
  }

  commitInlineEdit(id, text) {
    const title = (text || '').trim() || 'Untitled';
    const tasks = this.state.tasks.map((t) => (t.id === id ? { ...t, title } : t));
    this.setState({ editingId: null });
    const cur = this.state.tasks.find((t) => t.id === id);
    if (cur && cur.title !== title) this.persist(tasks);
  }

  cancelInlineEdit() {
    this.setState({ editingId: null });
  }

  // Commit + exit an active inline rename when the pointer goes down elsewhere.
  // Board/card mousedown handlers call preventDefault (to stop drag text
  // selection), which also suppresses the native blur — so we blur explicitly,
  // which fires the title's onBlur commit. Returns true if we were editing.
  maybeExitInlineEdit() {
    if (!this.state.editingId) return false;
    const el = document.activeElement;
    if (el && el.isContentEditable && typeof el.blur === 'function') {
      el.blur(); // synchronously fires Timeline's onBlur -> commit + clear
    } else {
      this.setState({ editingId: null });
    }
    return true;
  }

  renderTodoPanel() {
    const nowSlot = Math.ceil(minutesSince(this.state.originMs) / SNAP_MIN) * SNAP_MIN;
    // Board dividers (#75) group tracks visually; mirror that grouping in the
    // "add to timeline" menu so the same separations read there too.
    const dividedAfter = new Set(this.state.dividers.map((d) => d.afterTrackId));
    const lastIndex = this.state.tracks.length - 1;
    const tracks = this.state.tracks.map((tr, index) => {
      const at = this.backlogCursor(index, TODO_MINUTES);
      return {
        id: tr.id,
        index,
        name: tr.name || 'Untitled track',
        color: tr.color,
        at: at <= nowSlot ? 'now' : fmt(at, this.props.timeFormat),
        divAfter: index < lastIndex && dividedAfter.has(tr.id),
      };
    });
    // Scheduled to-dos show where their card sits.
    const byTaskId = {};
    this.state.tasks.forEach((t) => (byTaskId[t.id] = t));
    const todos = this.state.todos.map((t) => {
      const task = t.taskId ? byTaskId[t.taskId] : null;
      if (t.taskId && !task) return { ...t, taskId: null };
      return task
        ? {
            ...t,
            schedLabel:
              (this.state.tracks[task.lane] ? this.state.tracks[task.lane].name : 'Board') +
              ' · ' +
              fmt(task.start, this.props.timeFormat),
          }
        : t;
    });
    // The group's assigned timeline: the lane of the ROOT's linked board task.
    // Every row under that root carries it as groupTrackIndex so the panel can
    // one-click a child straight onto the group's track (no picker). null when
    // the root isn't on the board yet.
    const byId = {};
    this.state.todos.forEach((t) => (byId[t.id] = t));
    const rootOf = (t) => {
      let cur = t;
      let guard = 0;
      while (cur && cur.parentId && byId[cur.parentId] && guard < 50) {
        cur = byId[cur.parentId];
        guard += 1;
      }
      return cur;
    };
    const todosWithGroup = todos.map((t) => {
      const root = rootOf(t);
      const rootTask = root && root.taskId ? byTaskId[root.taskId] : null;
      const groupTrackIndex = rootTask && typeof rootTask.lane === 'number' ? rootTask.lane : null;
      return groupTrackIndex != null ? { ...t, groupTrackIndex } : t;
    });

    // Live rows vs. the soft-deleted bin. Live-list logic (folding, counts,
    // scheduling) only ever sees live rows; the panel renders the deleted bin
    // separately behind its own toggle.
    const liveTodos = todosWithGroup.filter((t) => !t.deletedAt);
    const deletedTodos = todos.filter((t) => t.deletedAt).slice().sort((a, b) => b.deletedAt - a.deletedAt);
    return (
      <TodoPanel
        todos={liveTodos}
        deletedTodos={deletedTodos}
        tracks={tracks}
        draftId={this.state.todoDraftId}
        onDraftHandled={() => this.setState({ todoDraftId: null })}
        width={this.state.panelWidth}
        resizing={!!this.state.panelResizing}
        onResizeDown={(e) => this.startPanelResize(e)}
        onClose={() => this.closeTodoPanel()}
        onAddToTrack={(id, laneIndex) => this.addTodoToTrack(id, laneIndex)}
        onChange={(a) => {
          if (a.type === 'add') this.addTodo(a.parentId, a.afterId);
          else if (a.type === 'tick') this.toggleTodoDone(a.id);
          else if (a.type === 'rename') this.setTodoTitle(a.id, a.title);
          else if (a.type === 'renameNext') this.renameTodoAndAdd(a.id, a.title, a.parentId);
          else if (a.type === 'indent') this.indentTodo(a.id, a.dir, a.title);
          else if (a.type === 'notes') this.setTodoNotes(a.id, a.notes);
          else if (a.type === 'remove') this.removeTodo(a.id);
          else if (a.type === 'restore') this.restoreTodo(a.id);
          else if (a.type === 'reorder') this.reorderTodo(a.dragId, a.targetId);
        }}
      />
    );
  }

  renderBacklogPanel() {
    const trackId = this.state.backlogTrackId;
    const lane = this.state.tracks.findIndex((tr) => tr.id === trackId);
    if (lane < 0) return null;
    const entries = this.trackBacklog(trackId);
    // Only tracks that actually have something waiting are worth a filter chip —
    // listing every timeline just buries the two that matter. The open track
    // always stays in the list so the panel never loses its own tab.
    const tracks = this.state.tracks
      .map((tr) => ({
        id: tr.id,
        name: tr.name || 'Untitled track',
        color: tr.color,
        count: this.state.backlog.filter((b) => b.trackId === tr.id && !b.done).length,
      }))
      .filter((tr) => tr.count > 0 || tr.id === trackId);
    let nextHint = '';
    if (entries.length) {
      const start = this.backlogCursor(lane, entries[0].duration || SNAP_MIN);
      nextHint = fmt(start, this.props.timeFormat);
    }
    return (
      <BacklogPanel
        tracks={tracks}
        activeTrackId={trackId}
        width={this.state.panelWidth}
        resizing={!!this.state.panelResizing}
        onResizeDown={(e) => this.startPanelResize(e)}
        entries={entries}
        nextHint={nextHint}
        onPickTrack={(id) => this.setState({ backlogTrackId: id, backlogHoverId: null })}
        onPull={(id) => this.pullFromTrackBacklog(id)}
        onDelete={(id) => {
          this.setState({ backlogHoverId: null });
          this.dropFromBacklog(id);
        }}
        onHover={(id) => {
          if (this.state.backlogHoverId !== id) this.setState({ backlogHoverId: id });
        }}
        onAddAll={() => this.pullAllFromTrackBacklog(trackId)}
        onClose={() => this.closeBacklogPanel()}
        onOpenCompleted={() => this.goCompleted()}
      />
    );
  }

  computeVals() {
    const V = this.state.orientation === 'vertical';
    const px = this.timeDensity();
    const laneSize = this.laneCross();
    const { dateBarH, hourBarH, trackHeaderH, totalMin } = LAYOUT;
    const rulerH = dateBarH + hourBarH;
    const timeAxisSize = totalMin * px;
    const tasks = this.state.tasks;
    const laneCount = this.state.tracks.length;
    const trackAxisSize = laneCount * laneSize;
    const nowMin = this.state.nowMin;
    const barSize = V ? trackHeaderH : rulerH;
    const selectionSet = new Set(this.state.selection);
    // #87: horizontal label-gutter width (0 when hidden via the header toggle or
    // in vertical mode). Hoisted here because the ruler ticks below are offset
    // right by gutterW to stay aligned with the offset lane body.
    // Gutter is hidden if the user pinned it hidden (sidebarCollapsed) OR the
    // scroll-direction auto-hide is currently engaged (labelsAutoHidden).
    const labelsHidden = !V && (this.state.sidebarCollapsed || this.state.labelsAutoHidden);
    const gutterW = V ? 0 : labelsHidden ? 0 : this.state.narrow ? Math.min(this.state.sidebarWidth, 140) : this.state.sidebarWidth;

    const tagsById = {};
    this.state.tags.forEach((tg) => (tagsById[tg.id] = tg));

    const trackDrag = this.state.trackDrag;
    const lanes = Array.from({ length: laneCount }, (_, i) => {
      const tr = this.trackFor(i);
      const isDraggingRow = trackDrag && trackDrag.moved && trackDrag.index === i;
      const isDropTarget =
        trackDrag && trackDrag.moved && trackDrag.overIndex === i && trackDrag.index !== i;
      return {
        index: i,
        name: tr.name,
        // The pinned rest lane: no delete button, no reorder handle.
        locked: isBreakTrack(tr.name),
        editing: this.state.editingTrack === i,
        tagList: (tr.tagIds || []).map((id) => tagsById[id]).filter(Boolean),
        // #89: enable the pull button only when the pull would ACTUALLY move the
        // lane forward (delta > 0). Using the same clamped delta as the action
        // keeps the button from showing yet doing nothing when the lane's block
        // is already pinned against the right edge of the canvas.
        hasMissed: this.missedPullDelta(i, nowMin) > 0,
        // Per-track backlog: count for the tray badge + open state.
        backlogCount: this.state.backlog.filter((b) => b.trackId === tr.id && !b.done).length,
        backlogOpen: !!tr.id && this.state.backlogTrackId === tr.id,
        onOpenBacklog: (e) => {
          e.stopPropagation();
          if (tr.id) this.openBacklogPanel(tr.id);
        },
        rowStyle: {
          height: laneSize + 'px',
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          padding: '0 12px',
          borderBottom: '1px solid rgba(255,255,255,.05)',
          position: 'relative',
          background: isDraggingRow ? 'rgba(255,255,255,.06)' : 'transparent',
          transform: isDraggingRow ? 'translateY(' + trackDrag.dy + 'px)' : 'none',
          zIndex: isDraggingRow ? 30 : 'auto',
          boxShadow: isDraggingRow
            ? '0 12px 30px rgba(0,0,0,.5)'
            : isDropTarget
              ? 'inset 0 2px 0 #14b8a6, inset 0 -2px 0 #14b8a6'
              : 'none',
        },
        chipStyle: {
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '8px',
          padding: '0 10px',
          width: laneSize + 'px',
          flex: 'none',
          height: trackHeaderH + 'px',
          boxSizing: 'border-box',
          position: 'relative',
          borderRight: '1px solid rgba(255,255,255,.06)',
          background: isDraggingRow ? 'rgba(255,255,255,.08)' : 'transparent',
          transform: isDraggingRow ? 'translateX(' + trackDrag.dx + 'px)' : 'none',
          zIndex: isDraggingRow ? 30 : 'auto',
          boxShadow: isDraggingRow
            ? '0 8px 20px rgba(0,0,0,.5)'
            : isDropTarget
              ? 'inset 2px 0 0 #14b8a6, inset -2px 0 0 #14b8a6'
              : 'none',
        },
        // Colored left-accent bar (Google-Calendar/Todoist style) flush to the
        // leading edge of the dark track card. Absolutely positioned so it
        // spans the card height without disturbing the flex layout, inset a
        // little with rounded outer ends, and softly glows into the card.
        // Still the click target for cycling the track color.
        barStyle: {
          position: 'absolute',
          left: 0,
          top: '6%',
          bottom: '6%',
          width: '2px',
          borderRadius: '0 3px 3px 0',
          background: tr.color,
          boxShadow: '0 0 10px ' + tr.color + '66, 5px 0 14px -5px ' + tr.color + '55',
          cursor: 'pointer',
          zIndex: 1,
        },
        // Vertical mode: tracks are columns, so the color accent runs across the
        // TOP edge of the header (full width, ~2px tall, flush top, rounded
        // bottom ends) instead of down the left.
        barStyleV: {
          position: 'absolute',
          top: 0,
          left: '6%',
          right: '6%',
          height: '2px',
          borderRadius: '0 0 3px 3px',
          background: tr.color,
          boxShadow: '0 0 10px ' + tr.color + '66, 0 5px 14px -5px ' + tr.color + '55',
          cursor: 'pointer',
          zIndex: 1,
        },
        nameStyle: {
          fontSize: '12.5px',
          color: 'rgba(231,233,238,.75)',
          fontFamily: "'JetBrains Mono',monospace",
          outline: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          cursor: 'text',
        },
        nameStyleV: {
          fontSize: '12px',
          color: 'rgba(231,233,238,.9)',
          fontFamily: "'JetBrains Mono',monospace",
          outline: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          cursor: 'text',
          // Row layout: take the remaining width and allow ellipsis. minWidth:0
          // is required so the flex item can shrink instead of collapsing.
          flex: '1 1 auto',
          minWidth: 0,
          textAlign: 'left',
          boxSizing: 'border-box',
        },
        onCycleColor: () => this.cycleTrackColor(i),
        onDelete: (e) => {
          e.stopPropagation();
          this.requestDeleteTrack(i);
        },
        // The whole row/pill initiates a reorder drag, except while this track
        // is being renamed (caret must work) and except on the color dot /
        // delete button (marked data-no-drag), which keep their own click.
        onRowMouseDown: (e) => {
          if (this.state.editingTrack === i) return;
          if (e.target.closest('[data-no-drag]')) return;
          this.startTrackDrag(i, e);
        },
        onStartEdit: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.startTrackEdit(i);
        },
        onAddTag: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.openTagPicker(i, e.currentTarget.getBoundingClientRect());
        },
        onOpenTag: (tagId) => this.goTag(tagId),
        onRename: (e) => this.commitTrackEdit(i, e.target.innerText),
        onKeyDown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this._trackEditCancel = false;
            e.target.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this._trackEditCancel = true;
            e.target.blur();
          }
        },
      };
    });

    const laneRows = lanes.map((l, i) => {
      const c = this.trackFor(i).color;
      // Neutral lanes: no per-track tint or glow, just hairline separators, so
      // the board reads black and the (track-coloured) task cards carry colour.
      void c;
      const base = {
        background: 'transparent',
        zIndex: 0,
        position: 'absolute',
      };
      if (V)
        return {
          style: {
            ...base,
            top: 0,
            left: i * laneSize + 'px',
            width: laneSize + 'px',
            height: timeAxisSize + 'px',
            borderRight: '1px solid rgba(255,255,255,.05)',
          },
        };
      return {
        style: {
          ...base,
          left: 0,
          top: i * laneSize + 'px',
          width: timeAxisSize + 'px',
          height: laneSize + 'px',
          borderBottom: '1px solid rgba(255,255,255,.05)',
        },
      };
    });

    // --- Track dividers (#75) ---------------------------------------------
    // A divider is anchored to a track id and rendered at that lane's trailing
    // boundary, in the same scrolling content coord space as lanes/tasks. The
    // thin glowing line reads below task cards; a small dot handle (higher z)
    // near the label edge is the click target to add/remove.
    const trackIndexById = {};
    this.state.tracks.forEach((tr, i) => (trackIndexById[tr.id] = i));
    const dividerLineStyle = (cross) =>
      V
        ? {
            position: 'absolute',
            top: 0,
            left: cross + 'px',
            width: '2px',
            height: timeAxisSize + 'px',
            transform: 'translateX(-1px)',
            zIndex: 1,
            pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(94,234,212,.5), rgba(94,234,212,.24))',
            boxShadow: '0 0 8px rgba(94,234,212,.35)',
          }
        : {
            position: 'absolute',
            left: 0,
            top: cross + 'px',
            height: '2px',
            width: timeAxisSize + 'px',
            transform: 'translateY(-1px)',
            zIndex: 1,
            pointerEvents: 'none',
            background: 'linear-gradient(90deg, rgba(94,234,212,.5), rgba(94,234,212,.24))',
            boxShadow: '0 0 8px rgba(94,234,212,.35)',
          };
    // #93: the divider handle is a thin GLOWING EDGE segment sitting on the lane
    // boundary (replacing the old circular dot). Horizontal: it lives in the
    // sticky label gutter (spanning most of its width), pinned left so it stays
    // put on horizontal scroll, with a comfortable invisible hit-zone. Vertical:
    // a short vertical segment at the top of the column boundary. The visible
    // light + proximity/hover brightening are done in CSS (.divider-edge); `cross`
    // is exposed so the gutter can scale each edge's glow by cursor distance.
    const dividerEdgeStyle = (cross) =>
      V
        ? {
            position: 'absolute',
            left: cross + 'px',
            top: '3px',
            width: '18px',
            height: '30px',
            transform: 'translateX(-50%)',
            zIndex: 6,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          }
        : {
            position: 'absolute',
            top: cross + 'px',
            left: '6px',
            width: Math.max(10, gutterW - 12) + 'px',
            height: '16px',
            transform: 'translateY(-50%)',
            zIndex: 40,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
          };

    const usedBoundaries = new Set();
    const dividers = [];
    this.state.dividers.forEach((d) => {
      const idx = trackIndexById[d.afterTrackId];
      if (idx == null) return; // anchor track archived/removed → skip gracefully
      usedBoundaries.add(idx);
      const cross = (idx + 1) * laneSize;
      dividers.push({
        id: d.id,
        cross,
        lineStyle: dividerLineStyle(cross),
        edgeStyle: dividerEdgeStyle(cross),
        onRemove: (e) => {
          e.stopPropagation();
          this.removeDivider(d.id);
        },
      });
    });

    const dividerAdds = [];
    for (let i = 0; i < laneCount - 1; i++) {
      if (usedBoundaries.has(i)) continue;
      const afterTrackId = this.trackFor(i).id;
      const cross = (i + 1) * laneSize;
      dividerAdds.push({
        key: 'add' + i,
        cross,
        edgeStyle: dividerEdgeStyle(cross),
        onAdd: (e) => {
          e.stopPropagation();
          this.addDivider(afterTrackId);
        },
      });
    }

    const hourCount = totalMin / 60; // whole hours the canvas spans
    const hourTicks = Array.from({ length: hourCount + 1 }, (_, h) => ({
      label: fmtHour(h, this.props.timeFormat),
      style: {
        position: 'absolute',
        left: gutterW + h * 60 * px + 'px',
        top: dateBarH + 'px',
        height: hourBarH + 'px',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '7px',
        fontSize: '11px',
        color: 'rgba(231,233,238,.5)',
        borderLeft: '1px solid rgba(255,255,255,.1)',
        fontFamily: "'JetBrains Mono',monospace",
        whiteSpace: 'nowrap',
      },
    }));
    // #95: ten-minute minor labels between the hour labels on the horizontal
    // ruler (:10/:20/:30/:40/:50), each showing the FULL time (e.g. "9:10",
    // honoring the 12/24h setting; no AM/PM — the hour label carries the period).
    // This replaces the #85/#91 quarter-hour system and aligns with the app's
    // 10-min task snapping. Density/zoom-aware so they never crowd: `px` is px
    // per minute, so a 10-min step spans 10*px. When wide show all five; when
    // moderate show every other (:20/:40); when tighter show just :30; below
    // that show none. Kept smaller + dimmer than the hour labels (fontSize 8.5
    // vs 11, alpha .45 vs .5) for a clear hierarchy.
    const minorMarks =
      10 * px >= 32
        ? [10, 20, 30, 40, 50]
        : 10 * px >= 18
          ? [20, 40]
          : 10 * px >= 12
            ? [30]
            : [];
    const minorTicks = [];
    if (!V && minorMarks.length) {
      for (let h = 0; h < hourCount; h++) {
        for (const m of minorMarks) {
          minorTicks.push({
            key: h + '-' + m,
            label: fmtHM(h * 60 + m, this.props.timeFormat),
            style: {
              position: 'absolute',
              left: gutterW + (h * 60 + m) * px + 'px',
              top: dateBarH + 'px',
              height: hourBarH + 'px',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '4px',
              fontSize: '8.5px',
              color: 'rgba(231,233,238,.45)',
              borderLeft: '1px solid rgba(255,255,255,.06)',
              fontFamily: "'JetBrains Mono',monospace",
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            },
          });
        }
      }
    }
    const hourTicksV = Array.from({ length: hourCount + 1 }, (_, h) => ({
      label: fmtHour(h, this.props.timeFormat),
      style: {
        height: 60 * px + 'px',
        borderTop: '1px solid rgba(255,255,255,.1)',
        fontSize: '10.5px',
        color: 'rgba(231,233,238,.5)',
        fontFamily: "'JetBrains Mono',monospace",
        padding: '3px 0 0 8px',
        boxSizing: 'border-box',
        flex: 'none',
      },
    }));
    const baseDate = new Date(this.state.originMs);
    const dayOffsets = Array.from({ length: WINDOW_DAYS }, (_, i) => i);
    const dayBands = dayOffsets.map((dOff) => {
      const dt = new Date(baseDate);
      dt.setDate(dt.getDate() + dOff);
      const stripe = dOff % 2 ? 'rgba(255,255,255,.025)' : 'transparent';
      return {
        label: dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        style: {
          position: 'absolute',
          left: gutterW + dOff * 1440 * px + 'px',
          top: 0,
          width: 1440 * px + 'px',
          height: dateBarH + 'px',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '10px',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '.04em',
          color: 'rgba(231,233,238,.65)',
          background: stripe,
          borderBottom: '1px solid rgba(255,255,255,.08)',
          borderLeft: dOff > 0 ? '2px solid rgba(165,180,252,.55)' : 'none',
          boxSizing: 'border-box',
        },
      };
    });
    // Day boundaries across the lane body: a bright midnight line plus two small
    // labels — where the previous day ends and where the next day starts.
    const dayChip = {
      position: 'absolute',
      zIndex: 2,
      pointerEvents: 'none',
      padding: '3px 8px',
      borderRadius: '6px',
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '.04em',
      whiteSpace: 'nowrap',
    };
    const dayBoundaries = dayOffsets.slice(1).map((dOff) => {
      const prev = new Date(baseDate);
      prev.setDate(prev.getDate() + dOff - 1);
      const next = new Date(baseDate);
      next.setDate(next.getDate() + dOff);
      const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const at = dOff * 1440 * px;
      const startChip = { ...dayChip, color: '#c7d2fe', background: 'rgba(99,102,241,.22)', border: '1px solid rgba(129,140,248,.55)' };
      const endChip = { ...dayChip, color: 'rgba(231,233,238,.5)', background: 'rgba(16,17,22,.85)', border: '1px solid rgba(255,255,255,.1)' };
      return {
        id: 'day-' + dOff,
        startLabel: fmtDay(next),
        endLabel: 'end of ' + fmtDay(prev),
        lineStyle: V
          ? {
              position: 'absolute', left: 0, top: at - 1 + 'px', width: trackAxisSize + 'px', height: '2px', zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(90deg, rgba(165,180,252,.9), rgba(165,180,252,.55))',
              boxShadow: '0 0 12px rgba(129,140,248,.5)',
            }
          : {
              position: 'absolute', top: 0, left: at - 1 + 'px', width: '2px', height: trackAxisSize + 'px', zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(165,180,252,.9), rgba(165,180,252,.55))',
              boxShadow: '0 0 12px rgba(129,140,248,.5)',
            },
        startStyle: V ? { ...startChip, top: at + 6 + 'px', left: '6px' } : { ...startChip, left: at + 8 + 'px', top: '6px' },
        endStyle: V
          ? { ...endChip, top: at - 26 + 'px', left: '6px' }
          : { ...endChip, left: at - 8 + 'px', top: '6px', transform: 'translateX(-100%)' },
      };
    });
    const dayBandsV = dayOffsets.map((dOff) => {
      const dt = new Date(baseDate);
      dt.setDate(dt.getDate() + dOff);
      return {
        label: dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        style: {
          position: 'absolute',
          top: dOff * 1440 * px + 'px',
          left: 0,
          right: 0,
          fontSize: '9.5px',
          fontWeight: 700,
          letterSpacing: '.03em',
          color: '#a5b4fc',
          background: '#1a1a20',
          padding: '2px 6px',
          borderTop: dOff > 0 ? '1px solid rgba(99,102,241,.4)' : 'none',
        },
      };
    });

    // --- Energy bands (time-of-day energy gradient) --------------------------
    // A very faint per-day gradient painted across the TIME RULER (the strip
    // where the hours/dates are shown) that maps expected energy to time-of-day:
    // cool deep-focus morning, warm low-energy afternoon, dim night. It sits
    // BEHIND the day + hour labels. Horizontal: one strip per day across the
    // hour bar of the top ruler; ruler-space, so it re-adds gutterW like the
    // hour ticks, and spans only the hour bar (top: dateBarH, height: hourBarH).
    // Vertical: one strip per day down the sidebar time column (full column
    // width). pointerEvents:'none' so it never blocks interaction.
    // Full-spectrum "rainbow" energy ramp swept across the day: indigo pre-dawn ->
    // blue/cyan morning cool-focus -> green/yellow midday -> orange/red afternoon
    // warm dip -> magenta/indigo dusk. Alphas stay modest so the hour labels on top
    // stay legible; the effect is a soft prismatic wash, not a saturated bar.
    const ENERGY_H =
      'linear-gradient(90deg,' +
      hexToRgba('#818cf8', 0.10) + ' 0%,' +      // indigo pre-dawn
      hexToRgba('#38bdf8', 0.14) + ' 12%,' +     // blue early morning
      hexToRgba('#22d3ee', 0.17) + ' 25%,' +     // cyan morning cool-focus peak
      hexToRgba('#34d399', 0.16) + ' 38%,' +     // green late morning
      hexToRgba('#fde047', 0.15) + ' 50%,' +     // yellow midday
      hexToRgba('#fb923c', 0.16) + ' 63%,' +     // orange early afternoon
      hexToRgba('#f87171', 0.16) + ' 74%,' +     // red afternoon warm dip
      hexToRgba('#e879f9', 0.14) + ' 87%,' +     // magenta dusk
      hexToRgba('#818cf8', 0.10) + ' 100%)';     // indigo night
    const ENERGY_V = ENERGY_H.replace('90deg', '180deg');
    const energyBands = dayOffsets.map((dOff) => ({
      style: {
        position: 'absolute',
        top: dateBarH + 'px',
        left: gutterW + dOff * 1440 * px + 'px',
        width: 1440 * px + 'px',
        height: hourBarH + 'px',
        backgroundImage: ENERGY_H,
        pointerEvents: 'none',
        zIndex: 0,
      },
    }));
    const energyBandsV = dayOffsets.map((dOff) => ({
      style: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: dOff * 1440 * px + 'px',
        height: 1440 * px + 'px',
        backgroundImage: ENERGY_V,
        pointerEvents: 'none',
        zIndex: 0,
      },
    }));

    const drag = this.state.drag;
    const groupDrag = this.state.groupDrag;
    const resize = this.state.resize;
    const byId = {};
    tasks.forEach((t) => (byId[t.id] = t));
    const wiring = this.state.wiring;
    const pending = this.state.pendingConnect;

    // Live position of a task = its raw start/duration/lane with any in-progress
    // drag / group-move / resize applied. Connectors, chain links and live wires
    // read from this (not the raw task) so a dependency line stays glued to its
    // task and follows it in real time while the task is dragged or resized,
    // instead of snapping to the new position only on release. This mirrors the
    // exact adjustments the taskViews loop makes below, so the line and the card
    // can never drift apart.
    const livePosOf = (t) => {
      let start = t.start;
      let duration = t.duration;
      let lane = t.lane;
      if (drag && drag.chain && drag.chain.has(t.id)) {
        // Whole end-to-end chain translates rigidly by the drag's delta, so every
        // attached task (not just the grabbed one) tracks the cursor live.
        start = (drag.origStarts[t.id] ?? t.start) + (drag.deltaTime || 0);
        lane = (drag.origLanes[t.id] ?? t.lane) + (drag.deltaLane || 0);
      } else if (drag && drag.id === t.id) {
        start = drag.curStart;
        lane = drag.curLane;
      } else if (groupDrag && selectionSet.has(t.id)) {
        start = Math.max(0, Math.min(MAX_START, (groupDrag.orig[t.id] ?? t.start) + groupDrag.delta));
      }
      if (resize && resize.id === t.id) {
        duration = resize.curDuration;
        if (resize.edge === 'start') start = resize.curStart;
      }
      return { start, duration, lane };
    };

    // During a group-move, anchor the live time HUD to the leftmost (earliest)
    // selected task so a single, stable pill pair tracks the whole selection.
    let groupAnchorId = null;
    if (groupDrag) {
      let best = Infinity;
      this.state.selection.forEach((id) => {
        const gt = byId[id];
        if (!gt) return;
        const s = Math.max(0, Math.min(MAX_START, (groupDrag.orig[id] ?? gt.start) + groupDrag.delta));
        if (s < best) {
          best = s;
          groupAnchorId = id;
        }
      });
    }

    const taskViews = tasks.map((t) => {
      // isDragging = this card is part of the actively dragged chain (the grabbed
      // task or any task attached end-to-end to it), so the whole block gets the
      // mid-drag styling (no transition, raised z-index).
      const isDragging = drag && ((drag.chain && drag.chain.has(t.id)) || drag.id === t.id);
      const isGroupMoving = groupDrag && selectionSet.has(t.id);
      // Position from the single source of truth so cards and dependency lines
      // can never drift apart.
      const live = livePosOf(t);
      const lane = live.lane;
      const start = live.start;
      const duration = live.duration;
      const selected = selectionSet.has(t.id);
      const done = !!t.done;
      const timePx = start * px;
      const len = Math.max(duration * px, 36);
      const tr = this.trackFor(lane);
      const c = tr.color;
      const end = start + duration;
      let alpha;
      let urgent = false;
      // Modern glassmorphism: no glossy sheen. Just a soft hairline top light
      // and a gentle ambient shadow for a clean, crisp, contemporary card.
      const glow = 'inset 0 1px 0 rgba(255,255,255,.12), 0 4px 16px rgba(0,0,0,.28)';
      // A task is "current" (in progress / focus) when now falls within its
      // span. start/end are minute offsets from the same absolute origin as
      // nowMin (= minutesSince(origin)), so this stays correct across midnight
      // (offsets can exceed 1440). ANY in-progress task — on any track, in
      // either orientation — must read bright/full-strength and breathe; it
      // must never be dimmed by the distance-transparency spectrum.
      const current = nowMin >= start && nowMin < end;
      // Fill strengths match the dark-board prototype.
      if (current) {
        alpha = 0.3;
        urgent = true;
      } else if (nowMin < start) {
        alpha = 0.2; // upcoming
      } else {
        alpha = 0.12; // already finished (by time)
      }
      // Gentle single-hue gradient (subtle, not glossy).
      let bg = 'linear-gradient(155deg, ' + hexToRgba(c, alpha + 0.06) + ', ' + hexToRgba(c, alpha) + ')';
      let borderColor = hexToRgba(c, 0.38);
      let textColor = '#f5f6fa';
      if (done) {
        bg = 'linear-gradient(160deg, #16171d, #0f1014)';
        borderColor = 'rgba(255,255,255,.09)';
        textColor = 'rgba(231,233,238,.32)';
        urgent = false;
      }
      const isSource = wiring && wiring.sourceId === t.id;
      const laneOff = lane * laneSize + 8;
      const laneLen = laneSize - 16;
      const rectStyle = V
        ? { left: laneOff + 'px', top: timePx + 'px', width: laneLen + 'px', height: len + 'px' }
        : { left: timePx + 'px', top: laneOff + 'px', width: len + 'px', height: laneLen + 'px' };
      const dotBase = {
        position: 'absolute',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: c,
        border: '2px solid #101014',
        cursor: 'crosshair',
        zIndex: 5,
        boxShadow: '0 0 6px ' + c,
        transition: 'opacity .18s ease',
      };
      let dotStartStyle = V
        ? { ...dotBase, left: '50%', top: '-5px', transform: 'translateX(-50%)' }
        : { ...dotBase, left: '-5px', top: '50%', transform: 'translateY(-50%)' };
      let dotEndStyle = V
        ? { ...dotBase, left: '50%', bottom: '-5px', transform: 'translateX(-50%)' }
        : { ...dotBase, right: '-5px', top: '50%', transform: 'translateY(-50%)' };
      // Two-click connect: highlight the armed dot (bright amber ring) so the
      // user can see a connection is pending and where it originates.
      if (pending && pending.sourceId === t.id) {
        const armGlow = { background: '#ffd60a', boxShadow: '0 0 0 3px rgba(255,214,10,.5), 0 0 12px #ffd60a' };
        if (pending.side === 'start') dotStartStyle = { ...dotStartStyle, ...armGlow };
        else dotEndStyle = { ...dotEndStyle, ...armGlow };
      }
      const resizeHandleStyle = V
        ? { position: 'absolute', left: 0, right: 0, bottom: '-3px', height: '10px', cursor: 'ns-resize', zIndex: 4 }
        : { position: 'absolute', top: 0, bottom: 0, right: '-3px', width: '10px', cursor: 'ew-resize', zIndex: 4 };
      // Leading-edge resize handle: dragging moves `start`, keeps `end` fixed.
      // Mirrors resizeHandleStyle on the opposite edge (top in vertical, left in horizontal).
      const resizeHandleStyleStart = V
        ? { position: 'absolute', left: 0, right: 0, top: '-3px', height: '10px', cursor: 'ns-resize', zIndex: 4 }
        : { position: 'absolute', top: 0, bottom: 0, left: '-3px', width: '10px', cursor: 'ew-resize', zIndex: 4 };
      let boxShadow = isSource
        ? '0 0 0 3px ' + hexToRgba(c, 0.55) + ', 0 6px 18px rgba(0,0,0,.45)'
        : urgent
          ? undefined
          : glow;
      if (selected) boxShadow = '0 0 0 2px #22d3ee, 0 6px 18px rgba(0,0,0,.45)';
      // Claude-session marker: a clay stripe down the card's leading edge (left
      // in horizontal, top in vertical). Painted as a background layer so it
      // survives the in-progress pulse animation, which owns box-shadow.
      const claudeSession = !!t.claudeSession;
      if (claudeSession) {
        // Slight vertical fade so the stripe reads as lit rather than painted.
        const stripe = V
          ? 'linear-gradient(90deg, #e08a6a, #c26545) 0 0 / 100% 4px no-repeat'
          : 'linear-gradient(180deg, #e08a6a, #c26545) 0 0 / 4px 100% no-repeat';
        bg = stripe + ', ' + bg;
      }
      // Pomodoro focus binding: the task you're focusing on glows teal and pulses.
      const isFocus = t.id === this.state.focusTaskId;
      if (isFocus) boxShadow = '0 0 0 2px #5eead4, 0 0 16px rgba(94,234,212,.55), 0 6px 18px rgba(0,0,0,.45)';
      // Narrow (short) horizontal cards can't fit a readable title, so hide the
      // in-card text and show the name just to the right of the card. Vertical
      // cards span the full track width, so their ellipsis'd title + tooltip
      // suffice. #84: the label is hoverable (pointerEvents:auto) so it can carry
      // the full-name `title` tooltip for the very cards that need it most (the
      // narrow ones), but it stops its own mousedown so it never starts a
      // drag/marquee — gestures stay owned by the card body.
      const narrow = !V && len < NARROW_CARD_PX;
      // How many lines the title may wrap to before ellipsis-clamping. Derived
      // from the card's available height so tall cards (e.g. long vertical
      // tasks) show much more of the name while short cards clamp down to 1
      // line. The cross-axis card size differs by orientation: vertical cards
      // grow with duration (len), horizontal cards are the fixed lane height.
      const TITLE_LINE_PX = 15; // ~12px * 1.25 line-height
      const titleAvailPx = (V ? len : laneLen) - (V ? 22 : 12) - 20; // padding + time label + gap
      const titleLines = Math.max(1, Math.min(8, Math.floor(titleAvailPx / TITLE_LINE_PX)));
      const externalLabelStyle = {
        position: 'absolute',
        left: '100%',
        top: '50%',
        transform: 'translateY(-50%)',
        marginLeft: '7px',
        maxWidth: '260px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontSize: '11px',
        fontWeight: 600,
        color: done ? 'rgba(231,233,238,.45)' : '#eef0f4',
        textShadow: '0 1px 4px rgba(0,0,0,.9), 0 0 3px rgba(0,0,0,.75)',
        cursor: 'default',
        pointerEvents: 'auto',
        zIndex: 4,
      };
      // Live scrubbing HUD: show start/end time-of-day pills while this task is
      // actively being moved or resized (or is the group-move anchor). Sourced
      // from the in-progress start/duration so it reflects the snapped value.
      const showHud =
        isDragging ||
        (resize && resize.id === t.id) ||
        (isGroupMoving && t.id === groupAnchorId);
      const hud = showHud
        ? {
            start: fmt(start, this.props.timeFormat),
            end: fmt(end, this.props.timeFormat),
            color: c,
          }
        : null;
      return {
        id: t.id,
        title: t.title,
        narrow,
        titleLines,
        externalLabelStyle,
        hud,
        done,
        // #73: lit when this task has non-empty (non-whitespace) notes; drives
        // the accented state of the on-card notes icon. Derived from the same
        // t.notes the DetailPanel/MarkdownNotes edits, so it updates live.
        hasNotes: !!(t.notes && t.notes.trim()),
        claudeSession,
        // #link: this card came from a to-do; the card and the to-do row both
        // carry the stitch mark so the pair is recognisable from either side.
        linkedTodo: !!t.todoId,
        onToggleClaude: (e) => {
          e.stopPropagation();
          this.toggleClaudeSession(t.id);
        },
        editing: this.state.editingId === t.id,
        timeLabel: fmt(start, this.props.timeFormat) + ' · ' + durLabel(duration),
        // #92: data for the custom glass hover-card (full name + time range +
        // track name/color + tags). rangeLabel is a full start–end range plus
        // duration, richer than the compact on-card timeLabel.
        rangeLabel:
          fmt(start, this.props.timeFormat) +
          ' – ' +
          fmt(end, this.props.timeFormat) +
          ' · ' +
          durLabel(duration),
        trackName: tr.name,
        trackColor: c,
        tags: (tr.tagIds || []).map((id) => tagsById[id]).filter(Boolean),
        onClick: (e) => {
          e.stopPropagation();
          // Ignore the click the browser synthesizes at the end of a drag.
          if (this._dragJustHappened) {
            this._dragJustHappened = false;
            return;
          }
          // Single click (detail 1) selects just this task (same cyan-ring
          // selection state used by the marquee). Double-click (detail 2)
          // schedules inline title editing; a third click within the window is
          // a triple-click, so cancel the edit and toggle done/blackout.
          if (e.detail === 1) {
            // Single clean click just selects the task (cyan ring). The Markdown
            // panel is opened via the on-card notes icon (#71), not by clicking
            // the card, so double-click (rename) / triple-click (done) stay
            // reliable.
            this.setState({ selection: [t.id] });
          } else if (e.detail === 2) {
            clearTimeout(this._clickTimer);
            this._clickTimer = setTimeout(() => this.startInlineEdit(t), 260);
          } else if (e.detail >= 3) {
            clearTimeout(this._clickTimer);
            this.toggleDone(t);
          }
        },
        // Opens the right-side Markdown detail panel for this task (from the
        // on-card notes icon). Selects the task too but never drags/renames/dones.
        onSendToBacklog: (e) => {
          e.stopPropagation();
          this.sendToBacklog(t.id);
        },
        onOpenPanel: (e) => {
          e.stopPropagation();
          this.setState({ selection: [t.id], panelTaskId: t.id, backlogTrackId: null, backlogHoverId: null, todoPanelOpen: false });
        },
        onDbl: (e) => {
          // Swallow so double-clicking a task never bubbles to the board's
          // "create task on empty space" handler.
          e.stopPropagation();
        },
        onMouseDown: (e) => this.onCardMouseDown(t, e),
        onDotStartDown: (e) => this.startWire(t.id, 'start', e),
        onDotEndDown: (e) => this.startWire(t.id, 'end', e),
        onResizeDown: (e) => this.startResize(t, 'end', e),
        onResizeStartDown: (e) => this.startResize(t, 'start', e),
        dotStartStyle,
        dotEndStyle,
        resizeHandleStyle,
        resizeHandleStyleStart,
        style: {
          position: 'absolute',
          ...rectStyle,
          background: bg,
          backdropFilter: done ? undefined : 'blur(10px) saturate(120%)',
          WebkitBackdropFilter: done ? undefined : 'blur(10px) saturate(120%)',
          color: textColor,
          borderRadius: '12px',
          padding: V ? '11px 6px' : '6px 11px',
          boxSizing: 'border-box',
          cursor: isDragging || isGroupMoving ? 'grabbing' : 'grab',
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '4px',
          textDecoration: 'none',
          opacity: done ? 0.85 : 1,
          zIndex: isDragging || isGroupMoving ? 6 : 3,
          border: '1px solid ' + borderColor,
          boxShadow,
          animation: isFocus
            ? 'focusPulse 1.6s ease-in-out infinite'
            : urgent
              ? 'pulseUrgent 1.1s ease-in-out infinite'
              : undefined,
          transition:
            isDragging || isGroupMoving || (resize && resize.id === t.id)
              ? 'none'
              : 'left .18s ease, top .18s ease, width .18s ease, height .18s ease, box-shadow .2s ease, background .3s ease',
        },
      };
    });

    const showDeps = this.props.showDependencies !== false;
    const connectors = [];
    const chainLinks = [];
    if (showDeps) {
      tasks.forEach((t) => {
        (t.parentIds || []).forEach((pid) => {
          const p = byId[pid];
          if (!p) return;
          // Use live positions so the line tracks the card during a drag/resize.
          const cp = livePosOf(t);
          const pp = livePosOf(p);
          const adjacent = pp.lane === cp.lane && pp.start + pp.duration === cp.start;
          if (adjacent) {
            let x, y;
            if (V) {
              x = pp.lane * laneSize + laneSize / 2;
              y = cp.start * px;
            } else {
              x = cp.start * px;
              y = pp.lane * laneSize + laneSize / 2;
            }
            // Explicit dependency link that also happens to be adjacent. It's
            // never seam-detachable (detach only governs pure contact), so it
            // always shows the connected glyph.
            chainLinks.push({ id: t.id + '-' + pid, x, y, detached: false, aId: pid, bId: t.id, span: laneSize - 16 });
            return;
          }
          let x1, y1, x2, y2;
          if (V) {
            x1 = pp.lane * laneSize + laneSize / 2;
            y1 = (pp.start + pp.duration) * px;
            x2 = cp.lane * laneSize + laneSize / 2;
            y2 = cp.start * px;
          } else {
            x1 = (pp.start + pp.duration) * px;
            y1 = pp.lane * laneSize + laneSize / 2;
            x2 = cp.start * px;
            y2 = cp.lane * laneSize + laneSize / 2;
          }
          connectors.push({ id: t.id + '-' + pid, d: bezier(x1, y1, x2, y2, V), childId: t.id, parentId: pid });
        });
      });

      // Implicit dependency by contact: any two tasks that touch edge-to-edge in
      // the same lane get a seam glyph. When the seam is attached (default) they
      // drag as one block and the glyph shows connected; when the user has
      // detached the seam they move individually and the glyph shows broken. We
      // emit a glyph for BOTH states so there's always a dot to click to toggle,
      // once per touching pair, skipping seams already drawn above from a real
      // parentIds link so the glyph never doubles up.
      const drawnSeams = new Set(chainLinks.map((c) => Math.round(c.x) + ',' + Math.round(c.y)));
      for (let i = 0; i < tasks.length; i++) {
        for (let j = 0; j < tasks.length; j++) {
          if (i === j) continue;
          const a = tasks[i];
          const b = tasks[j];
          // a is the leading task, b the trailing one: a's end meets b's start.
          const ap = livePosOf(a);
          const bp = livePosOf(b);
          if (ap.lane !== bp.lane) continue;
          if (ap.start + ap.duration !== bp.start) continue;
          let x, y;
          if (V) {
            x = ap.lane * laneSize + laneSize / 2;
            y = bp.start * px;
          } else {
            x = bp.start * px;
            y = ap.lane * laneSize + laneSize / 2;
          }
          const key = Math.round(x) + ',' + Math.round(y);
          if (drawnSeams.has(key)) continue;
          drawnSeams.add(key);
          chainLinks.push({
            id: 'touch-' + a.id + '-' + b.id,
            x,
            y,
            detached: this.seamDetached(a, b),
            aId: a.id,
            bId: b.id,
            span: laneSize - 16,
          });
        }
      }

      // A linked seam already IS the dependency, so the two connection dots at
      // that seam are pointless: hide them (the stitch glyph takes their place).
      // Unlinked seams keep their dots so new dependencies can still be wired.
      const viewById = {};
      taskViews.forEach((v) => {
        viewById[v.id] = v;
      });
      const hideDot = { opacity: 0, pointerEvents: 'none' };
      chainLinks.forEach((cl) => {
        if (cl.detached) return;
        const lead = viewById[cl.aId]; // its end touches the seam
        const trail = viewById[cl.bId]; // its start touches the seam
        if (lead) lead.dotEndStyle = { ...lead.dotEndStyle, ...hideDot };
        if (trail) trail.dotStartStyle = { ...trail.dotStartStyle, ...hideDot };
      });
    }

    // Ghost card where the hovered backlog entry would land (backlog panel).
    let backlogGhost = null;
    if (this.state.backlogTrackId && this.state.backlogHoverId) {
      const entry = this.state.backlog.find((b) => b.id === this.state.backlogHoverId);
      const lane = this.state.tracks.findIndex((tr) => tr.id === this.state.backlogTrackId);
      if (entry && lane >= 0) {
        const dur = entry.duration || SNAP_MIN;
        const gStart = this.backlogCursor(lane, dur);
        const gLen = Math.max(Math.min(dur, totalMin - gStart) * px, 36);
        const gOff = lane * laneSize + 8;
        const gCross = laneSize - 16;
        const color = this.trackFor(lane).color;
        backlogGhost = {
          title: entry.title,
          style: {
            position: 'absolute',
            ...(V
              ? { left: gOff + 'px', top: gStart * px + 'px', width: gCross + 'px', height: gLen + 'px' }
              : { left: gStart * px + 'px', top: gOff + 'px', width: gLen + 'px', height: gCross + 'px' }),
            boxSizing: 'border-box',
            borderRadius: '12px',
            border: '1.5px dashed ' + hexToRgba(color, 0.7),
            background: hexToRgba(color, 0.07),
            color: hexToRgba(color, 0.95),
            fontSize: '11px',
            padding: V ? '8px 6px' : '0 10px',
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 2,
          },
        };
      }
    }

    let wireLive = null;
    if (wiring && byId[wiring.sourceId]) {
      const src = livePosOf(byId[wiring.sourceId]);
      let x1, y1;
      if (V) {
        x1 = src.lane * laneSize + laneSize / 2;
        y1 = wiring.side === 'end' ? (src.start + src.duration) * px : src.start * px;
      } else {
        y1 = src.lane * laneSize + laneSize / 2;
        x1 = wiring.side === 'end' ? (src.start + src.duration) * px : src.start * px;
      }
      wireLive = { d: bezier(x1, y1, wiring.x, wiring.y, V) };
    }

    // Pending two-click connection: a faint line from the armed dot to the
    // cursor, mirroring the drag-to-connect live wire.
    let pendingLive = null;
    if (pending && byId[pending.sourceId]) {
      const src = livePosOf(byId[pending.sourceId]);
      let x1, y1;
      if (V) {
        x1 = src.lane * laneSize + laneSize / 2;
        y1 = pending.side === 'end' ? (src.start + src.duration) * px : src.start * px;
      } else {
        y1 = src.lane * laneSize + laneSize / 2;
        x1 = pending.side === 'end' ? (src.start + src.duration) * px : src.start * px;
      }
      pendingLive = { d: bezier(x1, y1, pending.x, pending.y, V) };
    }

    // #95: 10-minute grid. Mild minor lines every 10 min (:00/:10/.../:50) with a
    // slightly stronger line on the hour, replacing the old 15-min lines. The
    // minor lines are density-gated (looser than the labels) so they don't turn
    // into a solid wash at very tight zoom; the hour lines always stay.
    const tenMin = 10 * px;
    const hourSpan = 60 * px;
    const showMinorGrid = tenMin >= 7;
    const minorLines = (dir) =>
      'repeating-linear-gradient(' +
      dir +
      ', rgba(255,255,255,.03) 0, rgba(255,255,255,.03) 1px, transparent 1px, transparent ' +
      tenMin +
      'px)';
    const hourLines = (dir) =>
      'repeating-linear-gradient(' +
      dir +
      ', rgba(255,255,255,.07) 0, rgba(255,255,255,.07) 1px, transparent 1px, transparent ' +
      hourSpan +
      'px)';
    // Hour lines listed first so they paint ON TOP of the mild minor lines.
    const gridImage = (dir) =>
      showMinorGrid ? hourLines(dir) + ',' + minorLines(dir) : hourLines(dir);
    const gridOverlayStyle = V
      ? {
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
          backgroundImage: gridImage('to bottom'),
        }
      : {
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
          backgroundImage: gridImage('to right'),
        };
    const contentW = V ? trackAxisSize : timeAxisSize;
    const contentH = V ? timeAxisSize : trackAxisSize;
    // #87: in HORIZONTAL mode the track labels live in a left gutter that is part
    // of the scrolling lane body (sticky left), so they can never drift from
    // their lanes. The lane body is offset right by gutterW; because contentRef
    // points at that offset inner element, client→content→time math is unchanged.
    const bodyW = V ? contentW : gutterW + timeAxisSize;
    const lanesStyle = V
      ? {
          position: 'relative',
          height: contentH + 'px',
          width: contentW + 'px',
          // Slightly translucent so the deep-space / Earth-horizon backdrop on the
          // app root subtly bleeds through the board while staying dark.
          backgroundColor: 'rgba(16,17,20,0.82)',
        }
      : {
          position: 'absolute',
          left: gutterW + 'px',
          top: 0,
          height: contentH + 'px',
          width: contentW + 'px',
          backgroundColor: 'rgba(16,17,20,0.82)',
        };
    // Outer body wrapper (horizontal): establishes the full scroll extent
    // (gutter + timeline) and hosts the sticky label gutter + offset content.
    const bodyOuterStyle = V
      ? null
      : { position: 'relative', width: bodyW + 'px', height: contentH + 'px' };
    // The sticky-left label column. Solid background + high z so lane content
    // scrolling underneath it stays hidden; it moves vertically with the lanes
    // (only `left` is sticky, not `top`).
    const labelGutterStyle = {
      position: 'sticky',
      left: 0,
      top: 0,
      flex: 'none',
      width: gutterW + 'px',
      height: contentH + 'px',
      background: '#151519',
      borderRight: '1px solid rgba(255,255,255,.08)',
      zIndex: 20,
      boxSizing: 'border-box',
      overflow: 'hidden',
    };

    const m = this.state.marquee;
    const marqueeRect =
      m && m.moved
        ? {
            left: Math.min(m.cx0, m.cx1),
            top: Math.min(m.cy0, m.cy1),
            width: Math.abs(m.cx1 - m.cx0),
            height: Math.abs(m.cy1 - m.cy0),
          }
        : null;

    const showNow = nowMin >= 0 && nowMin <= totalMin;
    // Live clock time shown on the now indicator. Derived from nowMin (minutes
    // since local-midnight origin), so it reflects real wall-clock time, updates
    // with the nowMin timer, and wraps correctly across midnight. Floor to whole
    // minutes so fmt never rounds seconds up to ":60".
    const nowTime = fmt(Math.floor(nowMin), this.props.timeFormat);
    let nowStyle, nowRulerStyle;
    const nowLine = {
      position: 'absolute',
      background: '#ffe14d',
      zIndex: 4,
      boxShadow:
        '0 0 2px #fff, 0 0 10px #ffd60a, 0 0 22px rgba(255,214,10,.85), 0 0 40px rgba(255,214,10,.45)',
    };
    // On-theme dark-glass pill that rides the now line and stacks the live time
    // over a small "NOW" label. pointer-events:none so it never blocks the board;
    // soft pulsing glow via the nowPulse keyframes (colon blink is on the time
    // span in Timeline).
    const nowLabelBase = {
      position: 'absolute',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1px',
      padding: '3px 8px',
      borderRadius: '7px',
      background: 'rgba(18,15,0,.62)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,214,10,.5)',
      color: '#ffd60a',
      fontFamily: "'JetBrains Mono',monospace",
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 6,
      boxShadow: '0 0 12px rgba(255,214,10,.4), 0 2px 8px rgba(0,0,0,.5)',
      animation: 'nowPulse 2.4s ease-in-out infinite',
    };
    if (V) {
      const nowTop = nowMin * px + 'px';
      nowStyle = { ...nowLine, left: 0, top: nowTop, height: '1px', width: contentW + 'px' };
      nowRulerStyle = { ...nowLabelBase, left: '6px', top: nowTop, transform: 'translateY(-50%)' };
    } else {
      const nowLeft = nowMin * px + 'px';
      // now-line lives inside the offset content wrapper (origin = time 0), so it
      // needs no gutter offset; the now-label lives in the ruler (origin = scroll
      // 0), so it does.
      nowStyle = { ...nowLine, left: nowLeft, top: 0, width: '1px', height: contentH + 'px' };
      nowRulerStyle = { ...nowLabelBase, left: gutterW + nowMin * px + 'px', top: dateBarH + 8 + 'px', transform: 'translateX(-50%)' };
    }

    const editingTask = this.state.editingId
      ? tasks.find((t) => t.id === this.state.editingId)
      : null;

    return {
      isVertical: V,
      notVertical: !V,
      orientationLabel: V ? '↕ Switch to horizontal' : '↔ Switch to vertical',
      sidebarToggleLabel: this.state.sidebarCollapsed ? '» Show sidebar' : '« Hide sidebar',
      sidebarCollapsed: this.state.sidebarCollapsed,
      gutterHeaderLabel: V ? 'Time' : 'Tracks',
      // #87: the standalone sidebar column now only renders in VERTICAL mode (the
      // time ruler). Horizontal track labels live in Timeline's sticky lane
      // gutter. Vertical keeps overflow hidden — the board wrapper is the single
      // scroller, so the time column scrolls in lockstep with the lanes.
      sidebarWrapStyle: {
        flex: 'none',
        width: (this.state.sidebarCollapsed ? 38 : this.state.sidebarWidth) + 'px',
        overflowX: 'hidden',
        overflowY: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,.08)',
        background: '#151519',
        position: 'relative',
        transition: this.state.sidebarResizing ? 'none' : 'width .15s ease',
      },
      gutterHeaderStyle: {
        position: 'sticky',
        top: 0,
        zIndex: 6,
        height: barSize + 'px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '0 8px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'rgba(231,233,238,.35)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        background: '#151519',
        flex: 'none',
      },
      timeColStyle: {
        position: 'relative',
        height: timeAxisSize + 'px',
        display: 'flex',
        flexDirection: 'column',
      },
      resizeHandleStyle: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '6px',
        cursor: 'col-resize',
        zIndex: 10,
      },
      lanes,
      laneRows,
      dividers,
      dividerAdds,
      hourTicks,
      minorTicks,
      hourTicksV,
      dayBands,
      dayBandsV,
      energyBands,
      energyBandsV,
      dayBoundaries,
      taskViews,
      connectors,
      onDeleteConnector: (childId, parentId) => this.deleteDependency(childId, parentId),
      chainLinks,
      backlogGhost,
      onToggleSeam: (aId, bId) => this.toggleSeamDetach(aId, bId),
      wireLive,
      pendingLive,
      lanesStyle,
      gridOverlayStyle,
      marqueeRect,
      // Header date chip. `todayLabel` is the REAL current date, derived from the
      // wall clock (NOT the origin — the origin is now DAYS_BEFORE days in the
      // past), so the header always shows the true current day. `nowClockLabel`
      // ticks with nowMin. `windowLabel` spells out the full span the canvas
      // covers (first day – last day) so the view's range is unambiguous (#96).
      todayLabel: new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      nowClockLabel: fmt(Math.floor(minutesSince(this.state.originMs)), this.props.timeFormat),
      windowLabel:
        baseDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' – ' +
        new Date(this.state.originMs + (WINDOW_DAYS - 1) * MINUTES_PER_DAY * 60000).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
      windowSpanLabel: WINDOW_DAYS + '-day view',
      svgWidthNum: contentW,
      svgHeightNum: contentH,
      rulerStyle: {
        position: 'sticky',
        top: 0,
        // Above the sticky label gutter (z20) so the ruler stays on top when the
        // lanes scroll vertically underneath it.
        zIndex: 25,
        height: barSize + 'px',
        width: bodyW + 'px',
        background: V ? '#151519' : '#0c0e14',
        borderBottom: '1px solid rgba(255,255,255,.07)',
        display: V ? 'flex' : 'block',
        alignItems: 'stretch',
      },
      // #87: top-left corner cell of the horizontal ruler — a sticky-left cover
      // over the gutter column holding the "Tracks" caption + add-track button.
      // Sits above everything (z30).
      rulerCornerStyle: {
        position: 'sticky',
        left: 0,
        top: 0,
        zIndex: 30,
        width: gutterW + 'px',
        height: barSize + 'px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '0 8px',
        boxSizing: 'border-box',
        background: '#151519',
        borderRight: '1px solid rgba(255,255,255,.08)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
      },
      labelGutterStyle,
      bodyOuterStyle,
      labelGutterW: gutterW,
      labelsHidden,
      isNarrow: this.state.narrow,
      toggleTrackGutter: () => this.toggleTrackGutter(),
      onPullMissed: (i) => this.pullMissedTask(i),
      contentRef: this.contentRef,
      scrollRef: this.scrollRef,
      // Wrapper for the timeline's scroll pane. In HORIZONTAL mode the time axis
      // runs left→right, so this pane owns the horizontal scroll (overflowX
      // auto). In VERTICAL mode the long axis is time (down the page) and it MUST
      // scroll together with the sidebar time-ruler, which lives in the outer
      // board wrapper — so here we keep overflow visible on BOTH axes and let the
      // board wrapper be the single vertical scroller. (Note: overflowX:auto with
      // overflowY:visible is illegal in CSS — the browser silently promotes
      // overflowY to `auto`, which would make this pane its own vertical scroller
      // and desync it from the ruler. That promotion was the root cause of the
      // vertical "now" line landing at the wrong hour.)
      scrollWrapStyle: V
        ? { flex: 1, minWidth: 0, overflow: 'visible' }
        : { flex: 1, overflowX: 'auto', overflowY: 'visible' },
      boardRef: this.boardRef,
      onBoardDblClick: this.onBoardDblClick,
      onBoardMouseDown: this.onBoardMouseDown,
      jumpToNow: () => this.jumpToNow(true),
      toggleOrientation: () => this.toggleOrientation(),
      toggleSidebar: () => this.toggleSidebar(),
      onSidebarResizeDown: (e) => this.startSidebarResize(e),
      showNow,
      nowStyle,
      nowRulerStyle,
      nowTime,
      zoomBarValue: V ? this.state.trackWidth : this.state.zoom,
      zoomBarMin: V ? TRACKW_MIN : ZOOM_MIN,
      zoomBarMax: V ? TRACKW_MAX : ZOOM_MAX,
      zoomBarStep: V ? TRACKW_STEP : ZOOM_STEP,
      zoomBarLabel: V ? 'Track width' : 'Density',
      zoomBarUnit: V ? 'px' : 'px/min',
      onZoomBarChange: V ? (w) => this.setTrackWidth(w) : (z) => this.setZoom(z),
      addTrack: () => this.addTrack(),
      onOpenArchive: () => this.goArchive(),
      onOpenCompleted: () => this.goCompleted(),
      onOpenTodo: () => this.openTodoPanel(),
      todoOpen: this.state.todoPanelOpen,
      todoCount: this.state.todos.filter(
        (t) => !t.deletedAt && !t.done && (t.parentId || !this.state.todos.some((c) => c.parentId === t.id)),
      ).length,
      completedCount: this.state.tasks.filter((t) => t.done).length + this.state.backlog.filter((b) => b.done).length,
      archiveCount: this.state.deletedTracks.length,
      onOpenBacklog: () => this.goBacklog(),
      backlogCount: this.state.backlog.filter((b) => !b.done).length,
      onOpenTags: () => this.goTags(),
      tagCount: this.state.tags.length,
      onTogglePomodoro: () => this.togglePomodoro(),
      pomodoroOpen: this.state.pomodoroOpen,
      focusTaskId: this.state.focusTaskId,
      // Header-centered live timer readout + click-to-pause/resume. On a BREAK
      // (short or long) the pill turns a warm amber so "resting vs focusing" is
      // unmistakable at a glance; during focus it keeps the phase's own color.
      pomo: this.state.pomo,
      pomoTimeLabel: mmss(this.state.pomo.remainingMs / 1000),
      pomoIsBreak: this.state.pomo.phase !== 'focus',
      pomoPhaseColor:
        this.state.pomo.phase === 'focus' ? PHASES.focus.color : '#fbbf24',
      pomoPhaseLabel: PHASES[this.state.pomo.phase].label,
      pomoRunning: this.state.pomo.running,
      onPomoStartPause: () => this.pomoStartPause(),
      pomoFocusTitle:
        this.state.pomo.phase === 'focus' && this.state.focusTaskId
          ? (this.state.tasks.find((t) => t.id === this.state.focusTaskId) || {}).title || null
          : null,
      editingId: this.state.editingId,
      editingTitle: editingTask ? editingTask.title : '',
      onCommitTitle: (id, text) => this.commitInlineEdit(id, text),
      onCancelTitle: () => this.cancelInlineEdit(),
      // Sync-to-Mac status for the header pill (the Mac is the source of truth;
      // this device just syncs). 'syncing' | 'online' | 'offline' + the epoch
      // ms of the last good round-trip, plus a manual "sync now" action.
      syncState: this.state.syncState,
      lastSyncAt: this.state.lastSyncAt,
      onSyncNow: () => this.syncNow(),
    };
  }

  render() {
    if (this.state.route === 'archive') {
      return (
        <ArchivePage
          deletedTracks={this.state.deletedTracks}
          tags={this.state.tags}
          originMs={this.state.originMs}
          timeFormat={this.props.timeFormat}
          onRestore={(id) => this.restoreTrack(id)}
          onPurge={(id) => this.purgeDeletedTrack(id)}
          onBack={() => this.goTimeline()}
        />
      );
    }
    if (this.state.route === 'completed') {
      return <CompletedPage items={this.completedTasks()} timeFormat={this.props.timeFormat} onBack={() => this.goTimeline()} />;
    }
    if (this.state.route === 'backlog') {
      return (
        <BacklogPage
          entries={this.sortBacklog(this.state.backlog.filter((b) => !b.done))}
          tracks={this.state.tracks}
          timeFormat={this.props.timeFormat}
          onRestore={(id) => this.restoreFromBacklog(id)}
          onRestoreAll={() => this.restoreAllFromBacklog()}
          onDrop={(id) => this.dropFromBacklog(id)}
          onClear={() => this.clearBacklog()}
          onBack={() => this.goTimeline()}
        />
      );
    }
    if (this.state.route === 'tags') {
      return (
        <TagManagerPage
          tags={this.state.tags}
          tracks={this.state.tracks}
          palette={PALETTE}
          onRename={(id, label) => this.setTagLabel(id, label)}
          onSetColor={(id, color) => this.setTagColor(id, color)}
          onDelete={(id) => this.deleteTag(id)}
          onBack={() => this.goTimeline()}
        />
      );
    }
    if (this.state.route === 'tag') {
      // Tags live on TRACKS: a task "pertains to" a tag when its track carries
      // that tag. Build the filtered, time-sorted task rows for the page.
      const selectedTagId = this.state.routeTagId;
      const tracks = this.state.tracks;
      const taggedLanes = new Set();
      tracks.forEach((tr, i) => {
        if ((tr.tagIds || []).includes(selectedTagId)) taggedLanes.add(i);
      });
      const rows = this.state.tasks
        .filter((t) => taggedLanes.has(t.lane))
        .map((t) => {
          const tr = tracks[t.lane] || {};
          const completedAt = typeof t.completedAt === 'number' ? t.completedAt : null;
          return {
            id: t.id,
            title: t.title,
            trackName: tr.name || 'Untitled track',
            trackColor: tr.color || '#8891a5',
            start: t.start,
            startLabel: fmt(t.start, this.props.timeFormat),
            durationLabel: durLabel(t.duration),
            timeLabel:
              fmt(t.start, this.props.timeFormat) +
              ' – ' +
              fmt(t.start + t.duration, this.props.timeFormat) +
              ' · ' +
              durLabel(t.duration),
            done: !!t.done,
            completedAt,
            completedLabel: completedAt != null ? fmtDateTime(completedAt, this.props.timeFormat) : null,
            hasNotes: !!(t.notes && t.notes.trim()),
          };
        });
      return (
        <TagTasksPage
          tags={this.state.tags}
          selectedTagId={selectedTagId}
          rows={rows}
          onSelectTag={(id) => this.goTag(id)}
          onBack={() => this.goTimeline()}
        />
      );
    }
    const vals = this.computeVals();
    const rootStyle = {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      // Suppress native text selection while dragging/resizing/marquee-selecting.
      // Editable fields (inputs + track-name contenteditable) opt back in via CSS.
      userSelect: 'none',
      WebkitUserSelect: 'none',
      // Deep-space backdrop with a faint Earth-limb / atmosphere glow arcing
      // across the bottom. Kept very dark and low-contrast for readability.
      background:
        'radial-gradient(150% 78% at 50% 132%, rgba(34,102,120,0.22), rgba(14,32,46,0.10) 40%, rgba(9,12,17,0) 62%),' +
        'radial-gradient(120% 60% at 50% 128%, rgba(80,180,190,0.12), rgba(9,12,17,0) 46%),' +
        'radial-gradient(1000px 520px at 6% -12%, rgba(99,102,241,0.10), transparent 60%),' +
        'linear-gradient(180deg, #090a0e 0%, #0a0c11 55%, #0b1016 100%)',
    };
    const boardWrapStyle = {
      flex: 1,
      minHeight: 0,
      display: 'flex',
      overflowY: 'auto',
      overflowX: 'hidden',
      // Vertical mode: this wrapper is the SINGLE vertical scroller for both the
      // sidebar time-ruler and the timeline content, so the "now" line and tasks
      // stay glued to the correct hour tick while scrolling. align-items:flex-start
      // lets both columns grow to their full content height (instead of stretching
      // to the viewport and scrolling independently).
      ...(vals.isVertical ? { alignItems: 'flex-start' } : null),
    };
    const tp = this.state.tagPicker;
    const pickerTrack = tp ? this.state.tracks[tp.trackIndex] : null;
    const panelTask = this.state.panelTaskId
      ? this.state.tasks.find((t) => t.id === this.state.panelTaskId)
      : null;
    const panelTimeLabel = panelTask
      ? fmt(panelTask.start, this.props.timeFormat) + ' · ' + durLabel(panelTask.duration)
      : '';
    // On phones a side panel covers the entire screen, so board-level overlays
    // (the gutter handle, the floating date pill) must get out of its way.
    const coveredByPanel =
      this.state.narrow && !!(panelTask || this.state.backlogTrackId || this.state.todoPanelOpen);
    return (
      <div style={rootStyle}>
        <Header {...vals} />
        {this.state.syncState === 'offline' && (
          <div
            role="status"
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: "'JetBrains Mono',monospace",
              letterSpacing: '.02em',
              color: this.state.readOnlyNudge ? '#fecaca' : '#fca5a5',
              background: this.state.readOnlyNudge ? 'rgba(248,113,113,.22)' : 'rgba(248,113,113,.1)',
              borderBottom: '1px solid rgba(248,113,113,.3)',
              transition: 'background .25s ease, color .25s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 14a4 4 0 0 1 4-4 5 5 0 0 1 9.6 1.3A3.5 3.5 0 0 1 18 18H7" />
              <line x1="3" y1="3" x2="21" y2="21" />
            </svg>
            {this.state.readOnlyNudge
              ? 'Read-only — reconnect to the Mac to make changes'
              : 'Offline · viewing the last synced board (read-only). Will resync when the Mac is reachable.'}
          </div>
        )}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0, display: 'flex' }}>
          <div ref={vals.boardRef} style={boardWrapStyle}>
            {/* #87: horizontal mode renders track labels inside the lane body
                (Timeline's sticky gutter), so the standalone sidebar column is
                only used for the vertical-mode time ruler. */}
            {vals.isVertical && <Sidebar {...vals} />}
            <Timeline {...vals} />
          </div>
          {/* Phones: a thumb-sized handle on the board's left edge that folds the
              track-label gutter away and back. Horizontal mode only — vertical
              mode has no gutter to fold. */}
          {this.state.narrow && !vals.isVertical && !coveredByPanel && vals.labelsHidden && (
            <button
              type="button"
              onClick={() => this.toggleTrackGutter()}
              aria-label={vals.labelsHidden ? 'Show track labels' : 'Hide track labels'}
              aria-expanded={!vals.labelsHidden}
              title={vals.labelsHidden ? 'Show tracks' : 'Hide tracks'}
              style={{
                position: 'absolute',
                left: '0px',
                top: '5px',
                zIndex: 45,
                width: '26px',
                height: '30px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '0 9px 9px 0',
                border: '1px solid rgba(165,180,252,.45)',
                borderLeft: 'none',
                background: 'rgba(16,17,22,.92)',
                boxShadow: '0 6px 18px rgba(0,0,0,.5)',
                color: '#a5b4fc',
                cursor: 'pointer',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={vals.labelsHidden ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
              </svg>
            </button>
          )}
          {/* Scroll-aware date pill: floats over the board (outside the scroller,
              so it stays put), showing the day you're currently scrolled to. */}
          <div
            aria-hidden={!this.state.scrollPillVisible || coveredByPanel}
            style={{
              display: coveredByPanel ? 'none' : 'flex',
              position: 'absolute',
              top: '14px',
              left: '50%',
              transform: this.state.scrollPillVisible
                ? 'translate(-50%, 0)'
                : 'translate(-50%, -8px)',
              zIndex: 40,
              pointerEvents: 'none',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 15px',
              borderRadius: '999px',
              background: 'rgba(16,17,22,.9)',
              border: '1px solid rgba(165,180,252,.5)',
              boxShadow: '0 6px 22px rgba(0,0,0,.5), 0 0 18px rgba(129,140,248,.25)',
              backdropFilter: 'blur(6px)',
              color: '#e7e9ee',
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '.03em',
              whiteSpace: 'nowrap',
              opacity: this.state.scrollPillVisible ? 1 : 0,
              transition: 'opacity .22s ease, transform .22s ease',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#a5b4fc',
                boxShadow: '0 0 8px rgba(129,140,248,.9)',
                flex: 'none',
              }}
            />
            {this.state.scrolledDayLabel}
          </div>
          {this.state.pomodoroOpen && (
            <PomodoroPanel
              tasks={this.state.tasks}
              focusTaskId={this.state.focusTaskId}
              pomo={this.state.pomo}
              onStartPause={() => this.pomoStartPause()}
              onReset={() => this.pomoReset()}
              onSwitchPhase={(k, auto) => this.pomoSwitchPhase(k, auto)}
              onUpdateConfig={(k, v) => this.pomoUpdateConfig(k, v)}
              onSetFocusTask={(id) => this.setFocusTask(id)}
              onClose={() => this.setState({ pomodoroOpen: false })}
            />
          )}
          {!panelTask && !this.state.backlogTrackId && this.state.todoPanelOpen && this.renderTodoPanel()}
          {!panelTask && this.state.backlogTrackId && this.renderBacklogPanel()}
          {panelTask && (
            <DetailPanel
              task={panelTask}
              timeLabel={panelTimeLabel}
              done={!!panelTask.done}
              width={this.state.panelWidth}
              resizing={!!this.state.panelResizing}
              onResizeDown={(e) => this.startPanelResize(e)}
              onClose={() => this.closePanel()}
              onRename={(id, title) => this.setTaskTitle(id, title)}
              onToggleDone={() => this.toggleDone(panelTask)}
              onSendToBacklog={() => this.sendToBacklog(panelTask.id)}
              onSaveNotes={(notes) => this.setTaskNotes(panelTask.id, notes)}
              todoSnapshots={panelTask.todoSnapshots}
              onToggleTodo={(notes, snaps) => this.setTaskTodo(panelTask.id, notes, snaps)}
            />
          )}
        </div>
        {this.state.confirmDeleteTrackId && this.renderConfirmDeleteTrack()}
        {tp && pickerTrack && (
          <TagPicker
            rect={tp.rect}
            allTags={this.state.tags}
            assignedIds={pickerTrack.tagIds || []}
            palette={PALETTE}
            onToggle={(tagId) => this.toggleTrackTag(tp.trackIndex, tagId)}
            onCreate={(label) => this.createAndAssignTag(tp.trackIndex, label)}
            onSetColor={(tagId, color) => this.setTagColor(tagId, color)}
            onClose={() => this.closeTagPicker()}
          />
        )}
      </div>
    );
  }
}
