import React from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Timeline from './components/Timeline.jsx';
import TaskModal from './components/TaskModal.jsx';
import { PALETTE, LAYOUT, genTrackId, makeTracks, seedTasks } from './lib/constants.js';
import { currentMin, minToInput, inputToMin, fmt, fmtHour, durLabel } from './lib/time.js';
import { hexToRgba } from './lib/color.js';
import { bezier } from './lib/geometry.js';
import { loadData, saveData, loadView, saveView } from './lib/storage.js';

export default class App extends React.Component {
  constructor(props) {
    super(props);
    this.contentRef = React.createRef();
    this.scrollRef = React.createRef();
    this.boardRef = React.createRef();
    this.palette = PALETTE;
    this.state = {
      tasks: seedTasks(),
      tracks: makeTracks(),
      popupOpen: false,
      mode: 'add',
      draft: null,
      nowMin: currentMin(),
      dependQuery: '',
      dependOpen: false,
      drag: null,
      trackDrag: null,
      wiring: null,
      orientation: 'horizontal',
      sidebarWidth: 150,
      sidebarCollapsed: false,
      sidebarResizing: null,
    };
    this.onBoardDblClick = this.onBoardDblClick.bind(this);
    this.onDragMove = this.onDragMove.bind(this);
    this.onDragUp = this.onDragUp.bind(this);
    this.onTrackDragMove = this.onTrackDragMove.bind(this);
    this.onTrackDragUp = this.onTrackDragUp.bind(this);
    this.onWireMove = this.onWireMove.bind(this);
    this.onWireUp = this.onWireUp.bind(this);
    this.onSidebarResizeMove = this.onSidebarResizeMove.bind(this);
    this.onSidebarResizeUp = this.onSidebarResizeUp.bind(this);
  }

  get zoom() {
    return this.props.zoom ?? 2;
  }

  componentDidMount() {
    const s = loadData();
    if (s) {
      let tr = s.tracks && s.tracks.length ? s.tracks : this.state.tracks;
      tr = tr.map((t) => (t.id ? t : { ...t, id: genTrackId() }));
      const tasks = s.tasks.map((t) => ({
        ...t,
        parentIds: Array.isArray(t.parentIds) ? t.parentIds : t.parentId ? [t.parentId] : [],
      }));
      this.setState({ tasks, tracks: tr });
    }
    const v = loadView();
    if (v) {
      this.setState({
        orientation: v.orientation || 'horizontal',
        sidebarWidth: v.sidebarWidth || 150,
        sidebarCollapsed: !!v.sidebarCollapsed,
      });
    }
    this.timer = setInterval(() => this.setState({ nowMin: currentMin() }), 15000);
    const doJump = () => this.jumpToNow(false);
    requestAnimationFrame(() => requestAnimationFrame(doJump));
    setTimeout(doJump, 150);
  }

  componentWillUnmount() {
    clearInterval(this.timer);
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragUp);
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
    saveData(t, tr);
    this.setState({ tasks: t, tracks: tr });
  }

  persistView(next) {
    const v = {
      orientation: next.orientation ?? this.state.orientation,
      sidebarWidth: next.sidebarWidth ?? this.state.sidebarWidth,
      sidebarCollapsed: next.sidebarCollapsed ?? this.state.sidebarCollapsed,
    };
    saveView(v);
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
    this.persist(tasks, tracks);
  }

  startTrackDrag(index, e) {
    e.stopPropagation();
    if (e.button !== 0) return;
    this.setState({
      trackDrag: { index, overIndex: index, startY: e.clientY, startX: e.clientX, dy: 0, dx: 0 },
    });
    document.addEventListener('mousemove', this.onTrackDragMove);
    document.addEventListener('mouseup', this.onTrackDragUp);
  }

  onTrackDragMove(e) {
    const d = this.state.trackDrag;
    if (!d) return;
    const V = this.state.orientation === 'vertical';
    const delta = V ? e.clientX - d.startX : e.clientY - d.startY;
    const laneSize = LAYOUT.laneSize;
    const overIndex = Math.max(
      0,
      Math.min(this.state.tracks.length - 1, d.index + Math.round(delta / laneSize)),
    );
    this.setState({ trackDrag: { ...d, dy: e.clientY - d.startY, dx: e.clientX - d.startX, overIndex } });
  }

  onTrackDragUp() {
    document.removeEventListener('mousemove', this.onTrackDragMove);
    document.removeEventListener('mouseup', this.onTrackDragUp);
    const d = this.state.trackDrag;
    if (d && d.overIndex !== d.index) {
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

  onBoardDblClick(e) {
    if (e.target.closest('[data-dot]') || e.target.closest('[data-task]')) return;
    const el = this.contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = this.zoom;
    const laneSize = LAYOUT.laneSize;
    const V = this.state.orientation === 'vertical';
    const timeRaw = V ? e.clientY - rect.top : e.clientX - rect.left;
    const laneRaw = V ? e.clientX - rect.left : e.clientY - rect.top;
    let min = Math.round(timeRaw / px / 15) * 15;
    min = Math.max(0, Math.min(2865, min));
    const lane = Math.max(0, Math.min(this.state.tracks.length - 1, Math.floor(laneRaw / laneSize)));
    this.setState({
      popupOpen: true,
      mode: 'add',
      draft: { id: null, title: '', start: min, duration: 60, lane, parentIds: [] },
      dependQuery: '',
      dependOpen: false,
    });
  }

  jumpToNow(smooth) {
    const px = this.zoom;
    const V = this.state.orientation === 'vertical';
    if (V) {
      const b = this.boardRef.current;
      if (!b) return;
      const target = Math.max(0, currentMin() * px - b.clientHeight * 0.4);
      if (smooth === false) b.scrollTop = target;
      else b.scrollTo({ top: target, behavior: 'smooth' });
    } else {
      const sc = this.scrollRef.current;
      if (!sc) return;
      const target = Math.max(0, currentMin() * px - sc.clientWidth * 0.4);
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

  startDrag(task, e) {
    e.stopPropagation();
    if (e.button !== 0) return;
    this.setState({
      drag: {
        id: task.id,
        startX: e.clientX,
        startY: e.clientY,
        origStart: task.start,
        origLane: task.lane,
        curStart: task.start,
        curLane: task.lane,
        moved: false,
      },
    });
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.onDragUp);
  }

  onDragMove(e) {
    const d = this.state.drag;
    if (!d) return;
    const px = this.zoom;
    const laneSize = LAYOUT.laneSize;
    const V = this.state.orientation === 'vertical';
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    const timeDelta = V ? dy : dx;
    const laneDelta = V ? dx : dy;
    let newStart = Math.round((d.origStart + timeDelta / px) / 15) * 15;
    newStart = Math.max(0, Math.min(2865, newStart));
    const newLane = Math.max(
      0,
      Math.min(this.state.tracks.length - 1, d.origLane + Math.round(laneDelta / laneSize)),
    );
    this.setState({ drag: { ...d, curStart: newStart, curLane: newLane } });
  }

  onDragUp() {
    const d = this.state.drag;
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragUp);
    if (!d) return;
    if (d.moved) {
      const tasks = this.state.tasks.map((t) =>
        t.id === d.id ? { ...t, start: d.curStart, lane: d.curLane } : t,
      );
      this.persist(tasks);
    }
    this.setState({ drag: null });
  }

  openEdit(task) {
    this.setState({
      popupOpen: true,
      mode: 'edit',
      draft: { ...task, parentIds: (task.parentIds || []).slice() },
      dependQuery: '',
      dependOpen: false,
    });
  }

  setDraft(field, val) {
    this.setState((s) => ({ draft: { ...s.draft, [field]: val } }));
  }

  close() {
    this.setState({ popupOpen: false, draft: null, dependOpen: false });
  }

  save() {
    const d = this.state.draft;
    const t = {
      id: d.id || 'id' + Date.now() + Math.floor(Math.random() * 9999),
      title: (d.title || '').trim() || 'Untitled',
      lane: Number(d.lane),
      start: d.start,
      duration: Number(d.duration),
      parentIds: Array.isArray(d.parentIds) ? d.parentIds : [],
    };
    const tasks = d.id ? this.state.tasks.map((x) => (x.id === d.id ? t : x)) : [...this.state.tasks, t];
    this.persist(tasks);
    this.setState({ popupOpen: false, draft: null });
  }

  remove() {
    const d = this.state.draft;
    const tasks = this.state.tasks
      .filter((x) => x.id !== d.id)
      .map((x) => ({ ...x, parentIds: (x.parentIds || []).filter((pid) => pid !== d.id) }));
    this.persist(tasks);
    this.setState({ popupOpen: false, draft: null });
  }

  clearAll() {
    this.persist([], this.state.tracks);
  }

  computeVals() {
    const px = this.zoom;
    const { laneSize, dateBarH, hourBarH, trackHeaderH, totalMin } = LAYOUT;
    const rulerH = dateBarH + hourBarH;
    const V = this.state.orientation === 'vertical';
    const timeAxisSize = totalMin * px;
    const tasks = this.state.tasks;
    const laneCount = this.state.tracks.length;
    const trackAxisSize = laneCount * laneSize;
    const nowMin = this.state.nowMin;
    const barSize = V ? trackHeaderH : rulerH;

    const trackDrag = this.state.trackDrag;
    const lanes = Array.from({ length: laneCount }, (_, i) => {
      const tr = this.trackFor(i);
      const isDraggingRow = trackDrag && trackDrag.index === i;
      const isDropTarget = trackDrag && trackDrag.overIndex === i && trackDrag.index !== i;
      return {
        index: i,
        name: tr.name,
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
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 4px',
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
        dragHandleStyle: {
          cursor: isDraggingRow ? 'grabbing' : 'grab',
          color: 'rgba(231,233,238,.32)',
          fontSize: '12px',
          flex: 'none',
          userSelect: 'none',
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
          fontSize: '10px',
          color: 'rgba(231,233,238,.75)',
          fontFamily: "'JetBrains Mono',monospace",
          outline: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          cursor: 'text',
          maxWidth: '100%',
          textAlign: 'center',
        },
        onCycleColor: () => this.cycleTrackColor(i),
        onDelete: (e) => {
          e.stopPropagation();
          this.deleteTrack(i);
        },
        onRename: (e) => this.renameTrack(i, e.target.innerText),
        onKeyDown: (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.target.blur();
          }
        },
        onDragHandleDown: (e) => this.startTrackDrag(i, e),
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
    const baseDate = new Date();
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
    const byId = {};
    tasks.forEach((t) => (byId[t.id] = t));
    const wiring = this.state.wiring;

    const taskViews = tasks.map((t) => {
      const isDragging = drag && drag.id === t.id;
      const lane = isDragging ? drag.curLane : t.lane;
      const start = isDragging ? drag.curStart : t.start;
      const timePx = start * px;
      const len = Math.max(t.duration * px, 36);
      const tr = this.trackFor(lane);
      const c = tr.color;
      const end = t.start + t.duration;
      let alpha;
      let urgent = false;
      const glow = '0 6px 18px rgba(0,0,0,.45)';
      if (nowMin < t.start) {
        alpha = 0.12;
      } else if (nowMin >= end) {
        alpha = 0.3;
      } else {
        const prog = Math.max(0, Math.min(1, (nowMin - t.start) / t.duration));
        alpha = 0.12 + prog * 0.45;
        if (end - nowMin <= Math.min(15, t.duration * 0.25)) {
          urgent = true;
        }
      }
      const bg = 'linear-gradient(160deg, ' + hexToRgba(c, alpha + 0.12) + ', ' + hexToRgba(c, alpha) + ')';
      const isSource = wiring && wiring.sourceId === t.id;
      const laneOff = lane * laneSize + 8;
      const laneLen = laneSize - 16;
      const rectStyle = V
        ? { left: laneOff + 'px', top: timePx + 'px', width: laneLen + 'px', height: len + 'px' }
        : { left: timePx + 'px', top: laneOff + 'px', width: len + 'px', height: laneLen + 'px' };
      const dotStartStyle = V
        ? {
            position: 'absolute',
            left: '50%',
            top: '-5px',
            transform: 'translateX(-50%)',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: c,
            border: '2px solid #101014',
            cursor: 'crosshair',
            zIndex: 5,
            boxShadow: '0 0 6px ' + c,
          }
        : {
            position: 'absolute',
            left: '-5px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: c,
            border: '2px solid #101014',
            cursor: 'crosshair',
            zIndex: 5,
            boxShadow: '0 0 6px ' + c,
          };
      const dotEndStyle = V
        ? {
            position: 'absolute',
            left: '50%',
            bottom: '-5px',
            transform: 'translateX(-50%)',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: c,
            border: '2px solid #101014',
            cursor: 'crosshair',
            zIndex: 5,
            boxShadow: '0 0 6px ' + c,
          }
        : {
            position: 'absolute',
            right: '-5px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: c,
            border: '2px solid #101014',
            cursor: 'crosshair',
            zIndex: 5,
            boxShadow: '0 0 6px ' + c,
          };
      return {
        id: t.id,
        title: t.title,
        timeLabel: fmt(t.start, this.props.timeFormat) + ' · ' + durLabel(t.duration),
        onClick: (e) => {
          e.stopPropagation();
        },
        onDbl: (e) => {
          e.stopPropagation();
          this.openEdit(t);
        },
        onMouseDown: (e) => this.startDrag(t, e),
        onDotStartDown: (e) => this.startWire(t.id, 'start', e),
        onDotEndDown: (e) => this.startWire(t.id, 'end', e),
        dotStartStyle,
        dotEndStyle,
        style: {
          position: 'absolute',
          ...rectStyle,
          background: bg,
          color: '#f5f6fa',
          borderRadius: '11px',
          padding: V ? '11px 6px' : '6px 11px',
          boxSizing: 'border-box',
          cursor: isDragging ? 'grabbing' : 'grab',
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '1px',
          zIndex: isDragging ? 6 : 3,
          border: '1.5px solid ' + hexToRgba(c, Math.min(0.7, alpha + 0.22)),
          boxShadow: isSource
            ? '0 0 0 3px ' + hexToRgba(c, 0.55) + ', 0 6px 18px rgba(0,0,0,.45)'
            : urgent
              ? undefined
              : glow,
          animation: urgent ? 'pulseUrgent 1.1s ease-in-out infinite' : undefined,
          transition: isDragging
            ? 'none'
            : 'left .18s ease, top .18s ease, box-shadow .3s ease, background .3s ease',
        },
      };
    });

    const showDeps = this.props.showDependencies !== false;
    const connectors = [];
    if (showDeps) {
      tasks.forEach((t) => {
        (t.parentIds || []).forEach((pid) => {
          const p = byId[pid];
          if (!p) return;
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
    const gridOverlayStyle = V
      ? {
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,.07) 0, rgba(255,255,255,.07) 1px, transparent 1px, transparent ' +
            halfHour +
            'px)',
        }
      : {
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
          backgroundImage:
            'repeating-linear-gradient(to right, rgba(255,255,255,.07) 0, rgba(255,255,255,.07) 1px, transparent 1px, transparent ' +
            halfHour +
            'px)',
        };
    const contentW = V ? trackAxisSize : timeAxisSize;
    const contentH = V ? timeAxisSize : trackAxisSize;
    const lanesStyle = {
      position: 'relative',
      height: contentH + 'px',
      width: contentW + 'px',
      backgroundColor: '#101014',
    };

    const showNow = nowMin >= 0 && nowMin <= 1440;
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

    const d = this.state.draft;
    const q = (this.state.dependQuery || '').toLowerCase();
    const selectedSet = new Set(d ? d.parentIds || [] : []);
    const candidateTasks = tasks.filter((t) => (!d || t.id !== d.id) && !selectedSet.has(t.id));
    const filteredParentOptions = candidateTasks
      .filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, 30)
      .map((t) => ({
        id: t.id,
        title: t.title,
        dotStyle: {
          width: 9,
          height: 9,
          borderRadius: 3,
          background: this.trackFor(t.lane).color,
          flex: 'none',
        },
        onSelect: () => {
          const pids = (this.state.draft.parentIds || []).slice();
          if (!pids.includes(t.id)) pids.push(t.id);
          this.setState({ draft: { ...this.state.draft, parentIds: pids }, dependQuery: '', dependOpen: false });
        },
      }));
    const draftParentChips = d
      ? (d.parentIds || []).map((pid) => {
          const p = byId[pid];
          const col = p ? this.trackFor(p.lane).color : '#888';
          return {
            id: pid,
            title: p ? p.title : '(deleted)',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              background: hexToRgba(col, 0.18),
              border: '1px solid ' + hexToRgba(col, 0.5),
              color: '#e7e9ee',
              borderRadius: '20px',
              padding: '4px 8px',
              fontSize: '12px',
            },
            onRemove: () =>
              this.setDraft(
                'parentIds',
                (this.state.draft.parentIds || []).filter((x) => x !== pid),
              ),
          };
        })
      : [];

    return {
      isVertical: V,
      notVertical: !V,
      orientationLabel: V ? '↕ Switch to horizontal' : '↔ Switch to vertical',
      sidebarToggleLabel: this.state.sidebarCollapsed ? '» Show sidebar' : '« Hide sidebar',
      gutterHeaderLabel: V ? 'Time' : 'Tracks',
      sidebarWrapStyle: {
        flex: 'none',
        width: (this.state.sidebarCollapsed ? 0 : this.state.sidebarWidth) + 'px',
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
        padding: '0 16px',
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
      wireLive,
      lanesStyle,
      gridOverlayStyle,
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
      jumpToNow: () => this.jumpToNow(true),
      toggleOrientation: () => this.toggleOrientation(),
      toggleSidebar: () => this.toggleSidebar(),
      onSidebarResizeDown: (e) => this.startSidebarResize(e),
      showNow,
      nowStyle,
      nowRulerStyle,
      popupOpen: this.state.popupOpen,
      draft: d,
      isEdit: this.state.mode === 'edit',
      modalTitle: this.state.mode === 'edit' ? 'Edit task' : 'New task',
      saveLabel: this.state.mode === 'edit' ? 'Save changes' : 'Add task',
      draftStartInput: d ? minToInput(d.start) : '',
      trackOptions: lanes.map((l) => ({ index: l.index, name: l.name })),
      draftDot: d
        ? {
            width: '14px',
            height: '14px',
            borderRadius: '5px',
            background: this.trackFor(d.lane).color,
            boxShadow: '0 0 12px ' + this.trackFor(d.lane).color + '88',
          }
        : {},
      dependQuery: this.state.dependQuery,
      dependOpen: this.state.dependOpen,
      filteredParentOptions,
      noResults: filteredParentOptions.length === 0,
      draftParentChips,
      onDependInput: (e) => this.setState({ dependQuery: e.target.value, dependOpen: true }),
      onDependFocus: () => this.setState({ dependOpen: true }),
      onDependBlur: () => setTimeout(() => this.setState({ dependOpen: false }), 150),
      onTitle: (e) => this.setDraft('title', e.target.value),
      onStart: (e) => this.setDraft('start', inputToMin(e.target.value)),
      onDuration: (e) => this.setDraft('duration', parseInt(e.target.value, 10)),
      onTrack: (e) => this.setDraft('lane', parseInt(e.target.value, 10)),
      addTrack: () => this.addTrack(),
      save: () => this.save(),
      remove: () => this.remove(),
      close: () => this.close(),
      clearAll: () => this.clearAll(),
      stop: (e) => e.stopPropagation(),
    };
  }

  render() {
    const vals = this.computeVals();
    const rootStyle = {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      background:
        'radial-gradient(1200px 600px at 80% -10%, rgba(20,184,166,.09), transparent 60%),radial-gradient(1000px 500px at 0% 110%, rgba(99,102,241,.11), transparent 60%),#121214',
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
        {vals.popupOpen && <TaskModal {...vals} />}
      </div>
    );
  }
}
