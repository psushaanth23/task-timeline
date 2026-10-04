import React from 'react';
import { HoverButton } from './ui.jsx';
import ZoomBar from './ZoomBar.jsx';
import HelpPanel from './HelpPanel.jsx';
import { hexToRgba } from '../lib/color.js';

// Alpha helper for the phase-tinted timer pill, tolerant of a missing color.
const hexA = (hex, a) => hexToRgba(hex || '#5eead4', a);

// Compact "Xs/Xm/Xh ago" for the last successful sync, kept short for the pill.
function agoLabel(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

// Sync-to-Mac status pill. The Mac is the source of truth; this device just
// syncs, so the user mainly needs to know when that link is down. Green = in
// sync, amber (spinning) = a sync is in flight, red = offline. Clicking the
// pill forces a manual sync; when offline it also surfaces a "Sync now" label.
function SyncPill({ syncState, lastSyncAt, onSyncNow }) {
  // Re-tick every 10s so the "Xs ago" hint stays roughly honest while idle.
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const palette = {
    online: { c: '#34d399', bg: 'rgba(52,211,153,.12)', bd: 'rgba(52,211,153,.35)', label: 'Synced' },
    syncing: { c: '#fbbf24', bg: 'rgba(251,191,36,.12)', bd: 'rgba(251,191,36,.35)', label: 'Syncing' },
    offline: { c: '#f87171', bg: 'rgba(248,113,113,.14)', bd: 'rgba(248,113,113,.4)', label: 'Offline' },
  };
  const p = palette[syncState] || palette.online;
  const spinning = syncState === 'syncing';
  const text = syncState === 'offline' ? 'Sync now' : p.label;
  const title =
    syncState === 'offline'
      ? `Not syncing to the Mac — last synced ${agoLabel(lastSyncAt)}. Click to sync now.`
      : syncState === 'syncing'
      ? 'Syncing with the Mac…'
      : `In sync with the Mac · last synced ${agoLabel(lastSyncAt)}. Click to sync now.`;

  return (
    <button
      type="button"
      onClick={() => onSyncNow && onSyncNow()}
      disabled={spinning}
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '9.5px',
        fontWeight: 700,
        color: p.c,
        background: p.bg,
        border: `1px solid ${p.bd}`,
        padding: '2px 8px',
        borderRadius: '16px',
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
        flex: 'none',
        cursor: spinning ? 'default' : 'pointer',
        lineHeight: 1,
      }}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={spinning ? { animation: 'tl-spin 0.9s linear infinite' } : undefined}
      >
        {syncState === 'offline' ? (
          <>
            {/* cloud with a slash = link down */}
            <path d="M4 14a4 4 0 0 1 4-4 5 5 0 0 1 9.6 1.3A3.5 3.5 0 0 1 18 18H7" />
            <line x1="3" y1="3" x2="21" y2="21" />
          </>
        ) : (
          <>
            {/* refresh arrows */}
            <path d="M21 12a9 9 0 1 1-2.6-6.3" />
            <polyline points="21 3 21 8 16 8" />
          </>
        )}
      </svg>
      {text}
    </button>
  );
}

// Minimal orbit/timeline brand mark — a planet on an inclined orbit ring with
// a small satellite, subtle teal→indigo gradient and a soft glow. Crisp at 38px.
function BrandMark() {
  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 38 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 4px 14px rgba(45,212,191,.35))', flex: 'none' }}
    >
      <defs>
        <linearGradient id="brandCore" x1="8" y1="8" x2="30" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5eead4" />
          <stop offset="0.55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id="brandGlow" cx="0.5" cy="0.42" r="0.6">
          <stop stopColor="#a5f3fc" stopOpacity="0.9" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* soft ambient halo */}
      <circle cx="19" cy="19" r="17" fill="url(#brandGlow)" opacity="0.18" />
      {/* inclined orbit ring */}
      <ellipse
        cx="19"
        cy="19"
        rx="15"
        ry="6.6"
        transform="rotate(-32 19 19)"
        stroke="url(#brandCore)"
        strokeWidth="1.6"
        opacity="0.75"
      />
      {/* planet */}
      <circle cx="19" cy="19" r="6.4" fill="url(#brandCore)" />
      <circle cx="16.6" cy="16.6" r="2" fill="#ecfeff" opacity="0.5" />
      {/* satellite */}
      <circle cx="31.4" cy="11.2" r="2.1" fill="#a5f3fc" />
    </svg>
  );
}

export default function Header(props) {
  const {
    todayLabel,
    nowClockLabel,
    windowLabel,
    windowSpanLabel,
    isVertical,
    toggleOrientation,
    jumpToNow,
    zoomBarValue,
    zoomBarMin,
    zoomBarMax,
    zoomBarStep,
    zoomBarLabel,
    zoomBarUnit,
    onZoomBarChange,
    onOpenArchive,
    archiveCount = 0,
    onOpenCompleted,
    completedCount = 0,
    onOpenTodo,
    todoCount = 0,
    todoOpen = false,
    onOpenBacklog,
    backlogCount = 0,
    onOpenTags,
    tagCount = 0,
    sidebarCollapsed,
    toggleSidebar,
    onTogglePomodoro,
    pomodoroOpen,
    pomoTimeLabel,
    pomoPhaseColor,
    pomoPhaseLabel,
    pomoRunning,
    pomoFocusTitle,
    onPomoStartPause,
    syncState = 'online',
    lastSyncAt = null,
    onSyncNow,
  } = props;

  // Segmented orientation toggle. `toggleOrientation` simply flips the current
  // orientation, so each segment only fires when it isn't already active.
  const segWrap = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px',
    gap: '2px',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '10px',
  };
  const seg = (active) => ({
    background: active ? 'rgba(99,102,241,.22)' : 'transparent',
    border: active ? '1px solid rgba(99,102,241,.5)' : '1px solid transparent',
    color: active ? '#a5b4fc' : 'rgba(231,233,238,.55)',
    padding: '6px 13px',
    borderRadius: '8px',
    fontSize: '12.5px',
    fontWeight: 600,
    cursor: 'pointer',
    lineHeight: 1,
  });
  const goHorizontal = () => {
    if (isVertical) toggleOrientation();
  };
  const goVertical = () => {
    if (!isVertical) toggleOrientation();
  };
  const [helpOpen, setHelpOpen] = React.useState(false);

  // #112: everything except "Now" collapses into a single overflow menu so
  // the bar stops crowding at normal widths. The menu owns its own open
  // state and closes on outside click / Escape, but stays open while the
  // user is mid-adjustment on a toggle or the density slider.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuContainerRef = React.useRef(null);
  // The dropdown is rendered position:fixed (anchored to the button's measured
  // rect) rather than absolutely inside the header. The header scrolls
  // horizontally on overflow, and a scroll container can't let an absolute child
  // escape its clipped box — fixed positioning sidesteps that entirely.
  const [menuRect, setMenuRect] = React.useState(null);
  const openMenu = () => {
    const el = menuContainerRef.current;
    if (el) setMenuRect(el.getBoundingClientRect());
    setMenuOpen(true);
  };
  // Keep the dropdown pinned to the button if the bar scrolls or the window
  // resizes while it's open; simplest correct behavior is to just close it.
  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(false);
    const bar = document.querySelector('.app-header-bar');
    window.addEventListener('resize', close);
    if (bar) bar.addEventListener('scroll', close, { passive: true });
    return () => {
      window.removeEventListener('resize', close);
      if (bar) bar.removeEventListener('scroll', close);
    };
  }, [menuOpen]);

  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const handlePointerDown = (e) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const menuRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: '1px solid transparent',
    color: 'rgba(231,233,238,.8)',
    padding: '9px 10px',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: "'JetBrains Mono',monospace",
  };
  const menuRowHoverStyle = { background: 'rgba(255,255,255,.08)', color: '#e7e9ee' };
  const menuRowAmberStyle = {
    ...menuRowStyle,
    background: 'rgba(255,183,77,.12)',
    color: '#ffb74d',
  };
  const menuRowAmberHoverStyle = { background: 'rgba(255,183,77,.22)', color: '#ffcc80' };
  const menuDividerStyle = {
    height: '1px',
    margin: '6px 4px',
    background: 'rgba(255,255,255,.1)',
    flex: 'none',
  };
  const menuSectionLabelStyle = {
    fontSize: '10px',
    letterSpacing: '.09em',
    color: 'rgba(231,233,238,.4)',
    fontWeight: 700,
    textTransform: 'uppercase',
    padding: '4px 10px 2px',
  };

  return (
    <header
      className="app-header-bar"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        // Generic overflow fix: the bar is a single non-wrapping row that
        // scrolls horizontally once its contents no longer fit (any width, not
        // just phones). On touch this is finger-draggable natively. Children
        // keep their intrinsic size (flex:none) so nothing squishes/overlaps.
        flexWrap: 'nowrap',
        justifyContent: 'flex-start',
        gap: '18px',
        padding: '16px 26px',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        flex: 'none',
        background: 'linear-gradient(180deg,#141519,#101116)',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 'none' }}>
        <BrandMark />
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontWeight: 700,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                fontSize: '17px',
                background: 'linear-gradient(90deg,#e7fbff,#7dd3fc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Timeline
            </span>
            {/* #96: today's real date + a live clock. The board is anchored to
                today's midnight, so this is also the first day of the visible
                window — it can never read a stale date again. */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '9.5px',
                fontWeight: 700,
                color: '#ffd60a',
                background: 'rgba(255,214,10,.12)',
                border: '1px solid rgba(255,214,10,.3)',
                padding: '2px 7px',
                borderRadius: '16px',
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: '.04em',
                whiteSpace: 'nowrap',
                flex: 'none',
              }}
              title="Current date and time"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
                <line x1="3" y1="9.5" x2="21" y2="9.5" />
                <line x1="8" y1="2.5" x2="8" y2="6" />
                <line x1="16" y1="2.5" x2="16" y2="6" />
              </svg>
              {todayLabel}
              {nowClockLabel && (
                <>
                  <span style={{ opacity: 0.45 }}>·</span>
                  <span style={{ color: '#fff0a8' }}>{nowClockLabel}</span>
                </>
              )}
            </span>
            <SyncPill syncState={syncState} lastSyncAt={lastSyncAt} onSyncNow={onSyncNow} />
          </h1>
          {windowLabel && (
            <div
              style={{
                marginTop: '3px',
                fontSize: '10.5px',
                letterSpacing: '.05em',
                color: 'rgba(231,233,238,.42)',
                fontFamily: "'JetBrains Mono',monospace",
                whiteSpace: 'nowrap',
              }}
            >
              {windowSpanLabel || '48h view'} · {windowLabel}
            </div>
          )}
        </div>
      </div>

      {/* Center: always-visible Pomodoro readout on the header's own line.
          Auto side-margins center it when there's room. A soft phase-colored
          glow bleeds out to the left and right behind the pill and fades into
          the header, so the current mode (focus vs break, different colors) is
          readable at a glance without staring at the pill. */}
      <div
        style={{
          position: 'relative',
          flex: 'none',
          margin: '0 auto',
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Two stacked horizontal glows behind the pill for depth: a very wide,
            heavily-blurred base wash that melts far into the header, plus a
            tighter, brighter core hugging the pill. Both fade to transparent at
            the edges. Purely decorative, so they never eat clicks. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '620px',
            maxWidth: '80vw',
            height: '46px',
            borderRadius: '999px',
            pointerEvents: 'none',
            zIndex: -1,
            filter: 'blur(22px)',
            background:
              'linear-gradient(90deg,' +
              'transparent 0%,' +
              hexA(pomoPhaseColor, 0.0) + ' 8%,' +
              hexA(pomoPhaseColor, 0.08) + ' 30%,' +
              hexA(pomoPhaseColor, 0.14) + ' 50%,' +
              hexA(pomoPhaseColor, 0.08) + ' 70%,' +
              hexA(pomoPhaseColor, 0.0) + ' 92%,' +
              'transparent 100%)',
            transition: 'background .5s ease',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '300px',
            height: '30px',
            borderRadius: '999px',
            pointerEvents: 'none',
            zIndex: -1,
            filter: 'blur(11px)',
            background:
              'linear-gradient(90deg,' +
              'transparent 0%,' +
              hexA(pomoPhaseColor, 0.0) + ' 14%,' +
              hexA(pomoPhaseColor, 0.18) + ' 40%,' +
              hexA(pomoPhaseColor, 0.26) + ' 50%,' +
              hexA(pomoPhaseColor, 0.18) + ' 60%,' +
              hexA(pomoPhaseColor, 0.0) + ' 86%,' +
              'transparent 100%)',
            transition: 'background .5s ease',
          }}
        />
      <button
        type="button"
        onClick={() => onPomoStartPause && onPomoStartPause()}
        data-panel-opener="true"
        title={pomoRunning ? 'Pause focus timer' : 'Resume focus timer'}
        aria-label={pomoRunning ? 'Pause focus timer' : 'Resume focus timer'}
        style={{
          flex: 'none',
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '7px 14px 7px 11px',
          borderRadius: '999px',
          cursor: 'pointer',
          background: 'rgba(16,17,22,.72)',
          border: '1px solid ' + hexA(pomoPhaseColor, 0.55),
          boxShadow: '0 4px 16px rgba(0,0,0,.4), 0 0 16px ' + hexA(pomoPhaseColor, 0.22),
          color: '#e7e9ee',
          fontFamily: "'Space Grotesk',sans-serif",
          whiteSpace: 'nowrap',
        }}
      >
        {/* Play/pause glyph in a phase-colored disc. */}
        <span
          aria-hidden="true"
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            flex: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: hexA(pomoPhaseColor, 0.18),
            border: '1px solid ' + hexA(pomoPhaseColor, 0.6),
            color: pomoPhaseColor,
            animation: pomoRunning ? 'nowPulse 2.4s ease-in-out infinite' : undefined,
          }}
        >
          {pomoRunning ? (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1.5" y="1" width="3" height="10" rx="1" />
              <rect x="7.5" y="1" width="3" height="10" rx="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.5 1.3v9.4a.6.6 0 0 0 .92.5l7.3-4.7a.6.6 0 0 0 0-1L3.42.8a.6.6 0 0 0-.92.5z" />
            </svg>
          )}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '15px', fontWeight: 700, letterSpacing: '.02em' }}>
            {pomoTimeLabel}
          </span>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: pomoPhaseColor,
              maxWidth: '150px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {pomoFocusTitle || pomoPhaseLabel}
          </span>
        </span>
      </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          gap: '10px',
          flex: 'none',
        }}
      >
        {/* To-do panel — left of Completed. */}
        <HoverButton
          onClick={() => onOpenTodo && onOpenTodo()}
          title={'To-do' + (todoCount ? ' (' + todoCount + ' open)' : '')}
          aria-label="Open to-do list"
          aria-pressed={!!todoOpen}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            background: todoOpen ? 'rgba(94,234,212,.2)' : 'rgba(94,234,212,.08)',
            border: '1px solid rgba(94,234,212,' + (todoOpen ? '.6' : '.35') + ')',
            color: '#5eead4',
            padding: '8px 12px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          hoverStyle={{ background: 'rgba(94,234,212,.2)', color: '#a7f3d0' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="4 12 9 17 20 6" />
          </svg>
          {todoCount > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px' }}>{todoCount}</span>
          )}
        </HoverButton>
        {/* Completed tasks page — quick access next to Now. */}
        <HoverButton
          onClick={() => onOpenCompleted && onOpenCompleted()}
          title={'Completed tasks' + (completedCount ? ' (' + completedCount + ')' : '')}
          aria-label="View completed tasks"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            background: 'rgba(110,231,183,.08)',
            border: '1px solid rgba(110,231,183,.35)',
            color: '#6ee7b7',
            padding: '8px 12px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          hoverStyle={{ background: 'rgba(110,231,183,.18)', color: '#a7f3d0' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <polyline points="8 12.5 11 15.5 16.5 9" />
          </svg>
          {completedCount > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px' }}>{completedCount}</span>
          )}
        </HoverButton>
        {/* Focus / Pomodoro timer — toggled panel, styled like Now. Teal accent when open. */}
        <HoverButton
          onClick={() => onTogglePomodoro && onTogglePomodoro()}
          data-panel-opener="true"
          title="Focus timer"
          aria-label="Focus timer"
          aria-pressed={pomodoroOpen}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: pomodoroOpen ? 'rgba(94,234,212,.16)' : 'rgba(255,255,255,.05)',
            border: pomodoroOpen ? '1px solid rgba(94,234,212,.6)' : '1px solid rgba(255,255,255,.12)',
            color: pomodoroOpen ? '#5eead4' : 'rgba(231,233,238,.7)',
            padding: '8px 13px', borderRadius: '9px', fontSize: '13px', cursor: 'pointer', fontWeight: 600,
          }}
          hoverStyle={pomodoroOpen ? { background: 'rgba(94,234,212,.26)', color: '#99f6e4' } : { background: 'rgba(255,255,255,.1)', color: '#e7e9ee' }}
        >
          <span aria-hidden="true" style={{ fontSize: '14px', lineHeight: 1 }}>🍅</span>
          Focus
        </HoverButton>
        <HoverButton
          onClick={jumpToNow}
          title="Jump to now"
          aria-label="Jump to now"
          style={{
            background: 'rgba(255,214,10,.12)',
            border: '1px solid rgba(255,214,10,.5)',
            color: '#ffd60a',
            padding: '8px 15px',
            borderRadius: '9px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          hoverStyle={{ background: 'rgba(255,214,10,.22)' }}
        >
          Now
        </HoverButton>
        {/* #112: every other header control lives behind this single overflow
            menu so the bar doesn't crowd/overlap at normal widths. */}
        <div ref={menuContainerRef} style={{ position: 'relative', flex: 'none' }}>
          <HoverButton
            onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
            title="Menu"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              background: menuOpen ? 'rgba(99,102,241,.18)' : 'rgba(255,255,255,.05)',
              border: menuOpen ? '1px solid rgba(99,102,241,.5)' : '1px solid rgba(255,255,255,.12)',
              color: menuOpen ? '#a5b4fc' : 'rgba(231,233,238,.7)',
              padding: '8px 13px',
              borderRadius: '9px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 600,
              fontFamily: "'JetBrains Mono',monospace",
            }}
            hoverStyle={{ background: 'rgba(255,255,255,.1)', color: '#e7e9ee' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
              <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
            </svg>
            Menu
          </HoverButton>
          {menuOpen && (
            <div
              role="menu"
              aria-label="Timeline options"
              style={{
                position: 'fixed',
                top: (menuRect ? menuRect.bottom + 8 : 64) + 'px',
                right: (menuRect ? Math.max(8, window.innerWidth - menuRect.right) : 8) + 'px',
                zIndex: 40,
                minWidth: '230px',
                maxHeight: 'calc(100vh - ' + (menuRect ? menuRect.bottom + 20 : 80) + 'px)',
                overflowY: 'auto',
                background: 'rgba(16,22,32,.96)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: '12px',
                boxShadow: '0 18px 40px rgba(0,0,0,.5)',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div style={menuSectionLabelStyle}>View</div>
              <div style={{ padding: '2px 10px 6px' }}>
                <div style={segWrap} role="group" aria-label="Orientation">
                  <button type="button" style={{ ...seg(!isVertical), flex: 1 }} onClick={goHorizontal}>
                    Horizontal
                  </button>
                  <button type="button" style={{ ...seg(isVertical), flex: 1 }} onClick={goVertical}>
                    Vertical
                  </button>
                </div>
              </div>
              {/* #87: labels-on-lanes toggle (horizontal only). Hides the left
                  track label gutter for a full-width track view; state
                  persists via the same sidebarCollapsed flag. Vertical mode
                  uses top headers, so it's hidden there. */}
              {!isVertical && (
                <HoverButton
                  onClick={toggleSidebar}
                  title={sidebarCollapsed ? 'Show track labels' : 'Hide track labels'}
                  aria-label={sidebarCollapsed ? 'Show track labels' : 'Hide track labels'}
                  aria-pressed={!sidebarCollapsed}
                  role="menuitemcheckbox"
                  aria-checked={!sidebarCollapsed}
                  style={
                    sidebarCollapsed
                      ? menuRowStyle
                      : { ...menuRowStyle, background: 'rgba(99,102,241,.18)', color: '#a5b4fc' }
                  }
                  hoverStyle={sidebarCollapsed ? menuRowHoverStyle : { background: 'rgba(99,102,241,.28)', color: '#e7e9ee' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <line x1="9" y1="4" x2="9" y2="20" />
                  </svg>
                  {sidebarCollapsed ? 'Show track labels' : 'Hide track labels'}
                </HoverButton>
              )}

              <div style={menuDividerStyle} />
              <div style={menuSectionLabelStyle}>Lists</div>
              <HoverButton
                onClick={() => {
                  setMenuOpen(false);
                  onOpenArchive && onOpenArchive();
                }}
                title="View deleted tracks"
                aria-label="View deleted tracks"
                role="menuitem"
                style={menuRowStyle}
                hoverStyle={menuRowHoverStyle}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Deleted tracks{archiveCount > 0 ? ' (' + archiveCount + ')' : ''}
              </HoverButton>
              {/* #96: tasks that aged off the 48h board land in the backlog.
                  The row goes amber when something is waiting there. */}
              <HoverButton
                onClick={() => {
                  setMenuOpen(false);
                  onOpenBacklog && onOpenBacklog();
                }}
                title="Tasks that fell off the board"
                aria-label="Open backlog"
                role="menuitem"
                style={backlogCount > 0 ? menuRowAmberStyle : menuRowStyle}
                hoverStyle={backlogCount > 0 ? menuRowAmberHoverStyle : menuRowHoverStyle}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                  <path d="M3 7l2-4h14l2 4" />
                  <line x1="9" y1="12" x2="15" y2="12" />
                </svg>
                Backlog{backlogCount > 0 ? ' (' + backlogCount + ')' : ''}
              </HoverButton>
              <HoverButton
                onClick={() => {
                  setMenuOpen(false);
                  onOpenTags && onOpenTags();
                }}
                title="Manage tags"
                aria-label="Manage tags"
                role="menuitem"
                style={menuRowStyle}
                hoverStyle={menuRowHoverStyle}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                Tags{tagCount > 0 ? ' (' + tagCount + ')' : ''}
              </HoverButton>

              <div style={menuDividerStyle} />
              <div style={menuSectionLabelStyle}>Density</div>
              <div style={{ padding: '2px 10px 6px' }}>
                <ZoomBar
                  value={zoomBarValue}
                  min={zoomBarMin}
                  max={zoomBarMax}
                  step={zoomBarStep}
                  label={zoomBarLabel}
                  unit={zoomBarUnit}
                  onChange={onZoomBarChange}
                />
              </div>

              <div style={menuDividerStyle} />
              <HoverButton
                onClick={() => {
                  setMenuOpen(false);
                  setHelpOpen(true);
                }}
                title="How to use"
                aria-label="How to use"
                role="menuitem"
                style={menuRowStyle}
                hoverStyle={menuRowHoverStyle}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                How to use
              </HoverButton>
            </div>
          )}
        </div>
      </div>
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </header>
  );
}
