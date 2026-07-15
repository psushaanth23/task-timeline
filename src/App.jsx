import React from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Timeline from './components/Timeline.jsx';
import { PALETTE, LAYOUT, genTrackId, makeTracks, seedTasks } from './lib/constants.js';
import { fmt, fmtHour, durLabel, MS_PER_MIN, localMidnightMs, minutesSince } from './lib/time.js';
import { hexToRgba } from './lib/color.js';
import { bezier } from './lib/geometry.js';
import { loadData, saveData, loadView, saveView } from './lib/storage.js';
import { loadState, saveState } from './lib/remoteStore.js';
import { EdgeAutoScroller } from './lib/autoscroll.js';

// Horizontal mode: slider controls time density (pixels per minute).
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;
const ZOOM_STEP = 0.5;
// Vertical mode: slider controls the track-column width (pixels) instead,
// while the time axis keeps a fixed, compact density.
const TRACKW_MIN = 90;
const TRACKW_MAX = 320;
const TRACKW_STEP = 10;
const TRACKW_DEFAULT = 150;
const VERTICAL_PX = 1.5;
// Snap grid for task start/end (minutes). Offsets are measured from the fixed
// absolute origin (#37), so snapping to multiples of SNAP_MIN keeps both the
// start and the end on the 10-minute grid and works naturally across midnight.
const SNAP_MIN = 10;
// Max task start offset within the 48h (2880-min) canvas, kept on the snap grid.
const MAX_START = LAYOUT.totalMin - SNAP_MIN;
// Below this on-screen card length (px, horizontal mode) the in-card title is
// too cramped to read, so we hide it and render the name just outside the card.
const NARROW_CARD_PX = 90;

export default class App extends React.Component {
  constructor(props) {
    super(props);
    this.contentRef = React.createRef();
    this.scrollRef = React.createRef();
    this.boardRef = React.createRef();
    this.palette = PALETTE;
    // The timeline's pixel-0 is a fixed, absolute moment (local midnight of the
    // anchor day). Task `start` is a minute offset from this origin, so a task
    // maps to a real date+time and never shifts when the wall clock crosses
    // midnight. Persisted/migrated in componentDidMount / hydrateFromDisk.
    const originMs = localMidnightMs();
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
      wiring: null,
      orientation: 'horizontal',
      sidebarWidth: 150,
      sidebarCollapsed: false,
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
    this.onSidebarResizeMove = this.onSidebarResizeMove.bind(this);
    this.onSidebarResizeUp = this.onSidebarResizeUp.bind(this);
    this.scroller = new EdgeAutoScroller({
      getElement: () => this.scrollRef.current,
      getVertical: () => this.state.orientation === 'vertical',
      onTick: (x, y) => this.onScrollTick(x, y),
    });
    this.undoStack = [];
    this.redoStack = [];
    // Disk-persistence state: disk is the source of truth, localStorage is a
    // fast-paint cache + offline fallback. `_hydrated` gates disk writes until
    // the async disk load resolves; `_dirtyBeforeHydration` records whether the
    // user edited during that window so we don't clobber their changes.
    this._hydrated = false;
    this._dirtyBeforeHydration = false;
    this._diskTimer = null;
    this.onDocKeyDown = this.onDocKeyDown.bind(this);
  }

  // Time density (px per minute) for the current orientation. Vertical mode
  // keeps a fixed compact scale; horizontal mode uses the adjustable zoom.
  timeDensity() {
    return this.state.orientation === 'vertical' ? VERTICAL_PX : this.state.zoom;
  }

  // Cross-axis size of a track (row height in horizontal, column width in
  // vertical). Vertical mode uses the adjustable trackWidth.
  laneCross() {
    return this.state.orientation === 'vertical' ? this.state.trackWidth : LAYOUT.laneSize;
  }

  // Choose the timeline origin for a saved blob. New-format state carries an
  // absolute `origin` (epoch ms). Legacy state (minutes-of-day, no origin) is
  // migrated by anchoring to today's local midnight — since the old code always
  // rendered relative to today, this reproduces the exact same layout with no
  // jump, while making every task an absolute moment going forward.
  resolveOrigin(saved) {
    return saved && typeof saved.origin === 'number' ? saved.origin : localMidnightMs();
  }

  // Persist form: each task carries an absolute `startMs` so the file is
  // origin-independent and round-trips a real date+time.
  serializeTasks(tasks, originMs) {
    return tasks.map((t) => ({ ...t, startMs: originMs + Math.round(t.start) * MS_PER_MIN }));
  }

  // Rebuild in-memory tasks (minute offset from origin) from persisted tasks,
  // deriving `start` from the absolute `startMs` when present (new format) and
  // falling back to the raw `start` for legacy data. Also normalizes done/deps.
  hydrateTasks(rawTasks, originMs) {
    return rawTasks.map((t) => {
      const parentIds = Array.isArray(t.parentIds) ? t.parentIds : t.parentId ? [t.parentId] : [];
      const start = typeof t.startMs === 'number' ? Math.round((t.startMs - originMs) / MS_PER_MIN) : t.start;
      const out = { ...t, start, done: !!t.done, parentIds };
      delete out.startMs;
      return out;
    });
  }

  // Write the local (localStorage) cache in the absolute persist form.
  saveLocal(tasks, tracks) {
    saveData(this.serializeTasks(tasks, this.state.originMs), tracks, this.state.originMs);
  }

  componentDidMount() {
    const s = loadData();
    if (s) {
      const originMs = this.resolveOrigin(s);
      let tr = s.tracks && s.tracks.length ? s.tracks : this.state.tracks;
      tr = tr.map((t) => (t.id ? t : { ...t, id: genTrackId() }));
      const tasks = this.hydrateTasks(s.tasks, originMs);
      this.setState({ tasks, tracks: tr, originMs, nowMin: minutesSince(originMs) });
    }
    const v = loadView();
    if (v) {
      this.setState({
        orientation: v.orientation || 'horizontal',
        sidebarWidth: v.sidebarWidth || 150,
        sidebarCollapsed: !!v.sidebarCollapsed,
        zoom: v.zoom ?? this.state.zoom,
        trackWidth: v.trackWidth ?? this.state.trackWidth,
      });
    }
    this.timer = setInterval(() => this.setState({ nowMin: minutesSince(this.state.originMs) }), 15000);
    document.addEventListener('keydown', this.onDocKeyDown);
    // Best-effort flush of any pending debounced disk write on page unload.
    this._onBeforeUnload = () => this.flushDiskSave();
    window.addEventListener('beforeunload', this._onBeforeUnload);
    const doJump = () => this.jumpToNow(false);
    requestAnimationFrame(() => requestAnimationFrame(doJump));
    setTimeout(doJump, 150);
    // Disk is the source of truth: hydrate asynchronously after first paint.
    this.hydrateFromDisk();
  }

  // Build the view-preferences object persisted to both localStorage and disk.
  currentView() {
    return {
      orientation: this.state.orientation,
      sidebarWidth: this.state.sidebarWidth,
      sidebarCollapsed: this.state.sidebarCollapsed,
      zoom: this.state.zoom,
      trackWidth: this.state.trackWidth,
    };
  }

  diskPayload() {
    return {
      tasks: this.serializeTasks(this.state.tasks, this.state.originMs),
      tracks: this.state.tracks,
      origin: this.state.originMs,
      view: this.currentView(),
    };
  }

  // Debounced, fire-and-forget disk write. No-ops until hydration completes so
  // an in-flight load can't be overwritten by a stale save.
  syncDisk() {
    if (!this._hydrated) {
      this._dirtyBeforeHydration = true;
      return;
    }
    clearTimeout(this._diskTimer);
    this._diskTimer = setTimeout(() => {
      this._diskTimer = null;
      saveState(this.diskPayload());
    }, 350);
  }

  flushDiskSave() {
    if (!this._hydrated || !this._diskTimer) return;
    clearTimeout(this._diskTimer);
    this._diskTimer = null;
    saveState(this.diskPayload());
  }

  async hydrateFromDisk() {
    const disk = await loadState();
    if (disk && Array.isArray(disk.tasks) && !this._dirtyBeforeHydration) {
      // Disk wins: apply its tasks/tracks/view and mirror into the LS cache.
      const originMs = this.resolveOrigin(disk);
      let tr = disk.tracks && disk.tracks.length ? disk.tracks : this.state.tracks;
      tr = tr.map((t) => (t.id ? t : { ...t, id: genTrackId() }));
      const tasks = this.hydrateTasks(disk.tasks, originMs);
      const view = disk.view || {};
      this.setState(
        {
          tasks,
          tracks: tr,
          originMs,
          nowMin: minutesSince(originMs),
          orientation: view.orientation || this.state.orientation,
          sidebarWidth: view.sidebarWidth || this.state.sidebarWidth,
          sidebarCollapsed:
            view.sidebarCollapsed != null ? !!view.sidebarCollapsed : this.state.sidebarCollapsed,
          zoom: view.zoom ?? this.state.zoom,
          trackWidth: view.trackWidth ?? this.state.trackWidth,
        },
        () => {
          this.saveLocal(this.state.tasks, this.state.tracks);
          saveView(this.currentView());
          this._hydrated = true;
          this.jumpToNow(false);
        },
      );
    } else {
      // Nothing on disk yet (or the user already edited): seed disk from the
      // current in-memory state (localStorage/seed or the fresh edits).
      this._hydrated = true;
      saveState(this.diskPayload());
    }
  }

  componentWillUnmount() {
    clearInterval(this.timer);
    this.flushDiskSave();
    document.removeEventListener('keydown', this.onDocKeyDown);
    window.removeEventListener('beforeunload', this._onBeforeUnload);
    this.scroller.stop();
    this.removeBoardListeners();
    document.removeEventListener('mousemove', this.onTrackDragMove);
    document.removeEventListener('mouseup', this.onTrackDragUp);
    document.removeEventListener('mousemove', this.onWireMove);
    document.removeEventListener('mouseup', this.onWireUp);
    document.removeEventListener('mousemove', this.onSidebarResizeMove);
    document.removeEventListener('mouseup', this.onSidebarResizeUp);
  }

  persist(tasks, tracks) {
    const t = tasks || this.state.tasks;
    const tr = tracks || this.state.tracks;
    // Snapshot the pre-change state for undo (arrays are always replaced
    // immutably, so holding references is safe).
    this.undoStack.push({ tasks: this.state.tasks, tracks: this.state.tracks });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.saveLocal(t, tr);
    this.setState({ tasks: t, tracks: tr });
    this.syncDisk();
  }

  undo() {
    if (!this.undoStack.length) return;
    const prev = this.undoStack.pop();
    this.redoStack.push({ tasks: this.state.tasks, tracks: this.state.tracks });
    this.saveLocal(prev.tasks, prev.tracks);
    const liveIds = new Set(prev.tasks.map((t) => t.id));
    this.setState({
      tasks: prev.tasks,
      tracks: prev.tracks,
      selection: this.state.selection.filter((id) => liveIds.has(id)),
    });
    this.syncDisk();
  }

  redo() {
    if (!this.redoStack.length) return;
    const next = this.redoStack.pop();
    this.undoStack.push({ tasks: this.state.tasks, tracks: this.state.tracks });
    this.saveLocal(next.tasks, next.tracks);
    const liveIds = new Set(next.tasks.map((t) => t.id));
    this.setState({
      tasks: next.tasks,
      tracks: next.tracks,
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
    this.setState({ selection: [] });
    this.persist(tasks);
  }

  onDocKeyDown(e) {
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
      });
    tracks[index] = { ...tracks[index], name: (name || '').trim() || 'Track ' + (index + 1) };
    this.persist(null, tracks);
  }

  addTrack() {
    const tracks = this.state.tracks.slice();
    tracks.push({
      id: genTrackId(),
      name: 'Track ' + (tracks.length + 1),
      color: this.palette[tracks.length % this.palette.length],
    });
    this.persist(null, tracks);
  }

  deleteTrack(index) {
    if (this.state.tracks.length <= 1) return;
    const removedIds = this.state.tasks.filter((t) => t.lane === index).map((t) => t.id);
    const tracks = this.state.tracks.filter((_, i) => i !== index);
    const tasks = this.state.tasks
      .filter((t) => t.lane !== index)
      .map((t) => (t.lane > index ? { ...t, lane: t.lane - 1 } : t))
      .map((t) => ({ ...t, parentIds: (t.parentIds || []).filter((pid) => !removedIds.includes(pid)) }));
    this.setState({ selection: this.state.selection.filter((id) => !removedIds.includes(id)) });
    this.persist(tasks, tracks);
  }

  // A track drag can start anywhere on the row/pill (see onRowMouseDown). We
  // arm it on mousedown but only "pick up" the track once the pointer actually
  // moves past a small threshold, so a plain click (or a double-click for
  // rename) neither reorders nor flashes the drag styling.
  startTrackDrag(index, e) {
    if (e.button !== 0) return;
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
    const overIndex = Math.max(
      0,
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
    this.setState({ wiring: { sourceId: taskId, side, x: e.clientX - rect.left, y: e.clientY - rect.top } });
    document.addEventListener('mousemove', this.onWireMove);
    document.addEventListener('mouseup', this.onWireUp);
  }

  onWireMove(e) {
    const w = this.state.wiring;
    if (!w) return;
    const el = this.contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    this.setState({ wiring: { ...w, x: e.clientX - rect.left, y: e.clientY - rect.top } });
  }

  onWireUp(e) {
    document.removeEventListener('mousemove', this.onWireMove);
    document.removeEventListener('mouseup', this.onWireUp);
    const w = this.state.wiring;
    this.setState({ wiring: null });
    if (!w) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const dotEl = el && el.closest('[data-dot]');
    if (!dotEl) return;
    const targetId = dotEl.getAttribute('data-task-id');
    if (!targetId || targetId === w.sourceId) return;
    const tasks = this.state.tasks.map((t) => {
      if (t.id !== targetId) return t;
      const pids = Array.isArray(t.parentIds) ? t.parentIds.slice() : [];
      if (!pids.includes(w.sourceId)) pids.push(w.sourceId);
      return { ...t, parentIds: pids };
    });
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
    };
    this.persist([...this.state.tasks, task]);
    // Immediately enter inline rename on the fresh task; Timeline's effect
    // focuses + selects-all the contenteditable on the next frame once its
    // DOM node exists (same machinery as double-click-to-rename).
    this.setState({ editingId: task.id, selection: [] });
  }

  jumpToNow(smooth) {
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
    this.setState({ orientation });
    this.persistView({ orientation });
    requestAnimationFrame(() => requestAnimationFrame(() => this.jumpToNow(false)));
  }

  toggleSidebar() {
    const sidebarCollapsed = !this.state.sidebarCollapsed;
    this.setState({ sidebarCollapsed });
    this.persistView({ sidebarCollapsed });
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
      this.setState({ marquee: null, selection: [] });
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
    this.setState({ marquee: null, selection: sel });
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

  startSingleDrag(task, e) {
    const p = this.pointerToContent(e.clientX, e.clientY);
    if (!p) return;
    this.setState({
      drag: {
        id: task.id,
        grabTime: p.time - task.start,
        grabLane: p.laneFloat - task.lane,
        startClientX: e.clientX,
        startClientY: e.clientY,
        curStart: task.start,
        curLane: task.lane,
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
    const newStart = Math.max(0, Math.min(MAX_START, this.snapTime(p.time - d.grabTime)));
    const newLane = Math.max(0, Math.min(this.state.tracks.length - 1, Math.round(p.laneFloat - d.grabLane)));
    const moved = d.moved || Math.abs(x - d.startClientX) > 3 || Math.abs(y - d.startClientY) > 3;
    this.setState({ drag: { ...d, curStart: newStart, curLane: newLane, moved } });
  }

  finishSingleDrag() {
    const d = this.state.drag;
    if (d && d.moved) {
      this._dragJustHappened = true;
      const tasks = this.state.tasks.map((t) =>
        t.id === d.id ? { ...t, start: d.curStart, lane: d.curLane } : t,
      );
      this.persist(tasks);
    }
    this.setState({ drag: null });
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

  startResize(task, e) {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    this.setState({
      resize: { id: task.id, startClientX: e.clientX, startClientY: e.clientY, curDuration: task.duration, moved: false },
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
    let dur = this.snapTime(p.time - task.start);
    dur = Math.max(SNAP_MIN, Math.min(LAYOUT.totalMin - task.start, dur));
    const moved = r.moved || Math.abs(x - r.startClientX) > 3 || Math.abs(y - r.startClientY) > 3;
    this.setState({ resize: { ...r, curDuration: dur, moved } });
  }

  finishResize() {
    const r = this.state.resize;
    if (r && r.moved) {
      this._dragJustHappened = true;
      const tasks = this.state.tasks.map((t) => (t.id === r.id ? { ...t, duration: r.curDuration } : t));
      this.persist(tasks);
    }
    this.setState({ resize: null });
  }

  toggleDone(task) {
    const tasks = this.state.tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t));
    this.setState({ selection: this.state.selection.filter((id) => id !== task.id) });
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

    const trackDrag = this.state.trackDrag;
    const lanes = Array.from({ length: laneCount }, (_, i) => {
      const tr = this.trackFor(i);
      const isDraggingRow = trackDrag && trackDrag.moved && trackDrag.index === i;
      const isDropTarget =
        trackDrag && trackDrag.moved && trackDrag.overIndex === i && trackDrag.index !== i;
      return {
        index: i,
        name: tr.name,
        editing: this.state.editingTrack === i,
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
        dotStyle: {
          width: 11,
          height: 11,
          borderRadius: 4,
          background: tr.color,
          flex: 'none',
          cursor: 'pointer',
          boxShadow: '0 0 8px ' + tr.color + '99',
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
          this.deleteTrack(i);
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
      const base = {
        background: hexToRgba(c, 0.06),
        boxShadow: 'inset 0 0 14px ' + hexToRgba(c, 0.12),
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
            borderLeft: '1px solid ' + hexToRgba(c, 0.28),
            borderRight: '1px solid ' + hexToRgba(c, 0.28),
          },
        };
      return {
        style: {
          ...base,
          left: 0,
          top: i * laneSize + 'px',
          width: timeAxisSize + 'px',
          height: laneSize + 'px',
          borderTop: '1px solid ' + hexToRgba(c, 0.28),
          borderBottom: '1px solid ' + hexToRgba(c, 0.28),
        },
      };
    });

    const hourTicks = Array.from({ length: 49 }, (_, h) => ({
      label: fmtHour(h, this.props.timeFormat),
      style: {
        position: 'absolute',
        left: h * 60 * px + 'px',
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
    const hourTicksV = Array.from({ length: 49 }, (_, h) => ({
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
    const dayBands = [0, 1].map((dOff) => {
      const dt = new Date(baseDate);
      dt.setDate(dt.getDate() + dOff);
      return {
        label: dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        style: {
          position: 'absolute',
          left: dOff * 1440 * px + 'px',
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
          background: dOff % 2 ? 'rgba(255,255,255,.025)' : 'transparent',
          borderBottom: '1px solid rgba(255,255,255,.08)',
          boxSizing: 'border-box',
        },
      };
    });
    const dayBandsV = [0, 1].map((dOff) => {
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

    const drag = this.state.drag;
    const groupDrag = this.state.groupDrag;
    const resize = this.state.resize;
    const byId = {};
    tasks.forEach((t) => (byId[t.id] = t));
    const wiring = this.state.wiring;

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
      const isDragging = drag && drag.id === t.id;
      const isGroupMoving = groupDrag && selectionSet.has(t.id);
      let lane = t.lane;
      let start = t.start;
      let duration = t.duration;
      if (isDragging) {
        lane = drag.curLane;
        start = drag.curStart;
      } else if (isGroupMoving) {
        start = Math.max(0, Math.min(MAX_START, (groupDrag.orig[t.id] ?? t.start) + groupDrag.delta));
      }
      if (resize && resize.id === t.id) duration = resize.curDuration;
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
      // Translucent but polished — a modest spectrum that stays see-through.
      if (nowMin < start) {
        alpha = 0.1;
      } else if (nowMin >= end) {
        alpha = 0.18;
      } else {
        const prog = Math.max(0, Math.min(1, (nowMin - start) / duration));
        alpha = 0.1 + prog * 0.3;
        if (end - nowMin <= Math.min(15, duration * 0.25)) {
          urgent = true;
        }
      }
      // Gentle single-hue gradient (subtle, not glossy).
      let bg = 'linear-gradient(155deg, ' + hexToRgba(c, alpha + 0.06) + ', ' + hexToRgba(c, alpha) + ')';
      let borderColor = hexToRgba(c, Math.min(0.45, alpha + 0.18));
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
      };
      const dotStartStyle = V
        ? { ...dotBase, left: '50%', top: '-5px', transform: 'translateX(-50%)' }
        : { ...dotBase, left: '-5px', top: '50%', transform: 'translateY(-50%)' };
      const dotEndStyle = V
        ? { ...dotBase, left: '50%', bottom: '-5px', transform: 'translateX(-50%)' }
        : { ...dotBase, right: '-5px', top: '50%', transform: 'translateY(-50%)' };
      const resizeHandleStyle = V
        ? { position: 'absolute', left: 0, right: 0, bottom: '-3px', height: '10px', cursor: 'ns-resize', zIndex: 4 }
        : { position: 'absolute', top: 0, bottom: 0, right: '-3px', width: '10px', cursor: 'ew-resize', zIndex: 4 };
      let boxShadow = isSource
        ? '0 0 0 3px ' + hexToRgba(c, 0.55) + ', 0 6px 18px rgba(0,0,0,.45)'
        : urgent
          ? undefined
          : glow;
      if (selected) boxShadow = '0 0 0 2px #22d3ee, 0 6px 18px rgba(0,0,0,.45)';
      // Narrow (short) horizontal cards can't fit a readable title, so hide the
      // in-card text and show the name just to the right of the card. Vertical
      // cards span the full track width, so their ellipsis'd title + tooltip
      // suffice. The label is pointer-events:none so it never blocks
      // drag/resize/select/rename.
      const narrow = !V && len < NARROW_CARD_PX;
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
        fontSize: '12px',
        fontWeight: 600,
        color: done ? 'rgba(231,233,238,.45)' : '#eef0f4',
        textShadow: '0 1px 4px rgba(0,0,0,.9), 0 0 3px rgba(0,0,0,.75)',
        pointerEvents: 'none',
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
        externalLabelStyle,
        hud,
        done,
        editing: this.state.editingId === t.id,
        timeLabel: fmt(start, this.props.timeFormat) + ' · ' + durLabel(duration),
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
            this.setState({ selection: [t.id] });
          } else if (e.detail === 2) {
            clearTimeout(this._clickTimer);
            this._clickTimer = setTimeout(() => this.startInlineEdit(t), 260);
          } else if (e.detail >= 3) {
            clearTimeout(this._clickTimer);
            this.toggleDone(t);
          }
        },
        onDbl: (e) => {
          // Swallow so double-clicking a task never bubbles to the board's
          // "create task on empty space" handler.
          e.stopPropagation();
        },
        onMouseDown: (e) => this.onCardMouseDown(t, e),
        onDotStartDown: (e) => this.startWire(t.id, 'start', e),
        onDotEndDown: (e) => this.startWire(t.id, 'end', e),
        onResizeDown: (e) => this.startResize(t, e),
        dotStartStyle,
        dotEndStyle,
        resizeHandleStyle,
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
          gap: '1px',
          textDecoration: 'none',
          opacity: done ? 0.85 : 1,
          zIndex: isDragging || isGroupMoving ? 6 : 3,
          border: '1px solid ' + borderColor,
          boxShadow,
          animation: urgent ? 'pulseUrgent 1.1s ease-in-out infinite' : undefined,
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
          const adjacent = p.lane === t.lane && p.start + p.duration === t.start;
          if (adjacent) {
            let x, y;
            if (V) {
              x = p.lane * laneSize + laneSize / 2;
              y = t.start * px;
            } else {
              x = t.start * px;
              y = p.lane * laneSize + laneSize / 2;
            }
            chainLinks.push({ id: t.id + '-' + pid, x, y });
            return;
          }
          let x1, y1, x2, y2;
          if (V) {
            x1 = p.lane * laneSize + laneSize / 2;
            y1 = (p.start + p.duration) * px;
            x2 = t.lane * laneSize + laneSize / 2;
            y2 = t.start * px;
          } else {
            x1 = (p.start + p.duration) * px;
            y1 = p.lane * laneSize + laneSize / 2;
            x2 = t.start * px;
            y2 = t.lane * laneSize + laneSize / 2;
          }
          connectors.push({ id: t.id + '-' + pid, d: bezier(x1, y1, x2, y2, V) });
        });
      });
    }

    let wireLive = null;
    if (wiring && byId[wiring.sourceId]) {
      const src = byId[wiring.sourceId];
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

    const halfHour = 30 * px;
    const quarter = 15 * px;
    // Faint quarter-hour lines at :15 and :45 — a 30-min-period repeating line
    // offset by 15 min, drawn fainter than the hour/:30 lines (hierarchy:
    // hour/:30 .07 > :15/:45 .03).
    const quarterLines = (dir) =>
      'repeating-linear-gradient(' +
      dir +
      ', transparent 0, transparent ' +
      quarter +
      'px, rgba(255,255,255,.03) ' +
      quarter +
      'px, rgba(255,255,255,.03) ' +
      (quarter + 1) +
      'px, transparent ' +
      (quarter + 1) +
      'px, transparent ' +
      halfHour +
      'px)';
    const halfLines = (dir) =>
      'repeating-linear-gradient(' +
      dir +
      ', rgba(255,255,255,.07) 0, rgba(255,255,255,.07) 1px, transparent 1px, transparent ' +
      halfHour +
      'px)';
    const gridOverlayStyle = V
      ? {
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
          backgroundImage: quarterLines('to bottom') + ',' + halfLines('to bottom'),
        }
      : {
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
          backgroundImage: quarterLines('to right') + ',' + halfLines('to right'),
        };
    const contentW = V ? trackAxisSize : timeAxisSize;
    const contentH = V ? timeAxisSize : trackAxisSize;
    const lanesStyle = {
      position: 'relative',
      height: contentH + 'px',
      width: contentW + 'px',
      // Slightly translucent so the deep-space / Earth-horizon backdrop on the
      // app root subtly bleeds through the board while staying dark.
      backgroundColor: 'rgba(16,17,20,0.82)',
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
    let nowStyle, nowRulerStyle;
    if (V) {
      const nowTop = nowMin * px + 'px';
      nowStyle = {
        position: 'absolute',
        left: 0,
        top: nowTop,
        height: '1px',
        width: contentW + 'px',
        background: '#ffe14d',
        zIndex: 4,
        boxShadow:
          '0 0 2px #fff, 0 0 10px #ffd60a, 0 0 22px rgba(255,214,10,.85), 0 0 40px rgba(255,214,10,.45)',
      };
      nowRulerStyle = {
        position: 'absolute',
        left: '6px',
        top: nowTop,
        transform: 'translateY(-50%)',
        background: '#ffd60a',
        color: '#181200',
        fontSize: '9px',
        fontWeight: 800,
        padding: '2px 7px',
        borderRadius: '6px',
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        zIndex: 6,
        boxShadow: '0 0 12px rgba(255,214,10,.7)',
      };
    } else {
      const nowLeft = nowMin * px + 'px';
      nowStyle = {
        position: 'absolute',
        left: nowLeft,
        top: 0,
        width: '1px',
        height: contentH + 'px',
        background: '#ffe14d',
        zIndex: 4,
        boxShadow:
          '0 0 2px #fff, 0 0 10px #ffd60a, 0 0 22px rgba(255,214,10,.85), 0 0 40px rgba(255,214,10,.45)',
      };
      nowRulerStyle = {
        position: 'absolute',
        left: nowLeft,
        top: dateBarH + 8 + 'px',
        transform: 'translateX(-50%)',
        background: '#ffd60a',
        color: '#181200',
        fontSize: '9px',
        fontWeight: 800,
        padding: '2px 7px',
        borderRadius: '6px',
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        zIndex: 6,
        boxShadow: '0 0 12px rgba(255,214,10,.7)',
      };
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
      sidebarWrapStyle: {
        flex: 'none',
        width: (this.state.sidebarCollapsed ? 38 : this.state.sidebarWidth) + 'px',
        overflow: 'hidden',
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
      hourTicks,
      hourTicksV,
      dayBands,
      dayBandsV,
      taskViews,
      connectors,
      chainLinks,
      wireLive,
      lanesStyle,
      gridOverlayStyle,
      marqueeRect,
      todayLabel: baseDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      svgWidthNum: contentW,
      svgHeightNum: contentH,
      rulerStyle: {
        position: 'sticky',
        top: 0,
        zIndex: 5,
        height: barSize + 'px',
        width: contentW + 'px',
        background: V ? '#151519' : '#0c0e14',
        borderBottom: '1px solid rgba(255,255,255,.07)',
        display: V ? 'flex' : 'block',
        alignItems: 'stretch',
      },
      contentRef: this.contentRef,
      scrollRef: this.scrollRef,
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
      zoomBarValue: V ? this.state.trackWidth : this.state.zoom,
      zoomBarMin: V ? TRACKW_MIN : ZOOM_MIN,
      zoomBarMax: V ? TRACKW_MAX : ZOOM_MAX,
      zoomBarStep: V ? TRACKW_STEP : ZOOM_STEP,
      zoomBarLabel: V ? 'Track width' : 'Density',
      zoomBarUnit: V ? 'px' : 'px/min',
      onZoomBarChange: V ? (w) => this.setTrackWidth(w) : (z) => this.setZoom(z),
      addTrack: () => this.addTrack(),
      editingId: this.state.editingId,
      editingTitle: editingTask ? editingTask.title : '',
      onCommitTitle: (id, text) => this.commitInlineEdit(id, text),
      onCancelTitle: () => this.cancelInlineEdit(),
    };
  }

  render() {
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
    };
    return (
      <div style={rootStyle}>
        <Header {...vals} />
        <div ref={vals.boardRef} style={boardWrapStyle}>
          <Sidebar {...vals} />
          <Timeline {...vals} />
        </div>
      </div>
    );
  }
}
