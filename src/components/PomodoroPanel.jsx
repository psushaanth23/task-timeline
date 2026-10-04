import React from 'react';
import { PHASES, mmss } from '../lib/pomodoro.js';

const mono = "'JetBrains Mono',monospace";
const INK = '#e7e9ee';

// A timeline-native Pomodoro. It's a right-docked panel (matching DetailPanel)
// with a big progress ring, focus/break cycling, a per-day tomato tally, and —
// the timeline-native part — the ability to bind a session to a real board
// task: that task pulses on the board while you focus, and each completed focus
// session is logged back onto the task's notes with a timestamp.
//
// The ENGINE lives in App.jsx (so the timer keeps running and stays visible via
// the floating board chip when this panel is closed). This component is a pure
// view/controller: it renders the shared `pomo` state and calls back up for
// every action.
export default function PomodoroPanel({
  tasks = [],
  focusTaskId,
  pomo,
  onStartPause,
  onReset,
  onSwitchPhase,
  onUpdateConfig,
  onSetFocusTask,
  onClose,
}) {
  const [showSettings, setShowSettings] = React.useState(false);

  const { config, phase, running, remainingMs, tally } = pomo;
  const totalMs = phaseLen(config, phase) * 60000;
  const meta = PHASES[phase];

  // ── Ring geometry ─────────────────────────────────────────────────────────
  const R = 92;
  const C = 2 * Math.PI * R;
  const progress = totalMs > 0 ? 1 - remainingMs / totalMs : 0;
  const dash = C * Math.min(1, Math.max(0, progress));

  const focusTask = tasks.find((t) => t.id === focusTaskId) || null;
  const focusable = tasks.filter((t) => !t.done);

  // ── Styles ────────────────────────────────────────────────────────────────
  const panelStyle = {
    width: '340px',
    flex: 'none',
    height: '100%',
    background: 'linear-gradient(180deg,#141519,#0e0f14)',
    borderLeft: '1px solid rgba(255,255,255,.09)',
    boxShadow: '-18px 0 40px rgba(0,0,0,.45)',
    display: 'flex',
    flexDirection: 'column',
    color: INK,
    fontFamily: "'Space Grotesk',sans-serif",
    zIndex: 50,
  };
  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '15px 18px',
    borderBottom: '1px solid rgba(255,255,255,.07)',
  };
  const phaseTabStyle = (active, key) => ({
    flex: 1,
    padding: '7px 0',
    fontSize: '11.5px',
    fontWeight: 700,
    letterSpacing: '.03em',
    fontFamily: mono,
    textAlign: 'center',
    cursor: 'pointer',
    borderRadius: '8px',
    color: active ? '#0b0d10' : 'rgba(231,233,238,.6)',
    background: active ? PHASES[key].color : 'transparent',
    border: active ? '1px solid ' + PHASES[key].color : '1px solid rgba(255,255,255,.1)',
    transition: 'all .15s ease',
  });
  const bigBtn = {
    flex: 1,
    padding: '12px 0',
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: mono,
    letterSpacing: '.04em',
    borderRadius: '11px',
    cursor: 'pointer',
    border: '1px solid ' + meta.color,
    color: '#0b0d10',
    background: meta.color,
    boxShadow: '0 0 18px ' + meta.glow,
  };
  const ghostBtn = {
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: 700,
    fontFamily: mono,
    borderRadius: '11px',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,.14)',
    color: 'rgba(231,233,238,.8)',
    background: 'rgba(255,255,255,.04)',
  };

  return (
    <div style={panelStyle} data-task-panel="true" onMouseDown={(e) => e.stopPropagation()}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <span style={{ fontSize: '18px' }}>🍅</span>
          <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '.02em' }}>Pomodoro</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <IconBtn title="Settings" onClick={() => setShowSettings((s) => !s)} active={showSettings}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </IconBtn>
          <IconBtn title="Close" onClick={onClose}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </IconBtn>
        </div>
      </div>

      <div style={{ padding: '18px', overflowY: 'auto', flex: 1 }}>
        {/* Phase selector */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
          {['focus', 'short', 'long'].map((k) => (
            <div key={k} style={phaseTabStyle(phase === k, k)} onClick={() => onSwitchPhase(k, false)}>
              {k === 'focus' ? 'FOCUS' : k === 'short' ? 'SHORT' : 'LONG'}
            </div>
          ))}
        </div>

        {/* Progress ring */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '18px' }}>
          <svg width="220" height="220" viewBox="0 0 220 220">
            <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="12" />
            <circle
              cx="110"
              cy="110"
              r={R}
              fill="none"
              stroke={meta.color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`}
              transform="rotate(-90 110 110)"
              style={{ transition: 'stroke-dasharray .3s linear', filter: 'drop-shadow(0 0 6px ' + meta.glow + ')' }}
            />
            <text x="110" y="104" textAnchor="middle" fontSize="42" fontWeight="700" fill={INK} fontFamily={mono}>
              {mmss(remainingMs / 1000)}
            </text>
            <text x="110" y="132" textAnchor="middle" fontSize="12.5" fontWeight="700" fill={meta.color} fontFamily={mono} letterSpacing="1.5">
              {meta.label.toUpperCase()}
            </text>
          </svg>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '9px', marginBottom: '18px' }}>
          <button type="button" style={bigBtn} onClick={onStartPause}>
            {running ? 'PAUSE' : remainingMs < totalMs ? 'RESUME' : 'START'}
          </button>
          <button type="button" style={ghostBtn} onClick={onReset} title="Reset this phase">
            ↺
          </button>
        </div>

        {/* Today's tomatoes */}
        <div style={{ marginBottom: '16px' }}>
          <div style={sectionLabel}>Today · {tally.count} {tally.count === 1 ? 'session' : 'sessions'}</div>
          <div style={{ fontSize: '17px', lineHeight: 1.5, letterSpacing: '2px', minHeight: '26px' }}>
            {tally.count === 0 ? (
              <span style={{ color: 'rgba(231,233,238,.35)', fontSize: '13px', letterSpacing: 0, fontFamily: mono }}>
                No focus sessions yet
              </span>
            ) : (
              Array.from({ length: tally.count }).map((_, i) => <span key={i}>🍅</span>)
            )}
          </div>
        </div>

        {/* Focus-on-a-task binding — the timeline-native part */}
        <div style={{ marginBottom: showSettings ? '18px' : 0 }}>
          <div style={sectionLabel}>Focusing on</div>
          {focusTask ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                padding: '9px 11px',
                borderRadius: '10px',
                background: 'rgba(94,234,212,.08)',
                border: '1px solid rgba(94,234,212,.3)',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5eead4', boxShadow: '0 0 8px #5eead4', flex: 'none' }} />
              <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {focusTask.title || 'Untitled task'}
              </span>
              <button type="button" onClick={() => onSetFocusTask && onSetFocusTask(null)} style={clearLinkStyle} title="Stop focusing on this task">
                clear
              </button>
            </div>
          ) : (
            <select
              value=""
              onChange={(e) => onSetFocusTask && onSetFocusTask(e.target.value || null)}
              style={selectStyle}
            >
              <option value="">Pick a task to focus on…</option>
              {focusable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title || 'Untitled task'}
                </option>
              ))}
            </select>
          )}
          <div style={{ fontSize: '11px', color: 'rgba(231,233,238,.4)', marginTop: '7px', fontFamily: mono, lineHeight: 1.4 }}>
            The task pulses on the board while you focus; each finished focus logs a 🍅 line to its notes.
          </div>
        </div>

        {/* Settings */}
        {showSettings && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: '16px' }}>
            <div style={sectionLabel}>Durations (min)</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <NumField label="Focus" value={config.focusMin} onChange={(v) => onUpdateConfig('focusMin', v)} />
              <NumField label="Short" value={config.shortMin} onChange={(v) => onUpdateConfig('shortMin', v)} />
              <NumField label="Long" value={config.longMin} onChange={(v) => onUpdateConfig('longMin', v)} />
            </div>
            <NumField label="Long break every N focus" wide value={config.longEvery} onChange={(v) => onUpdateConfig('longEvery', v)} />
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Toggle label="Auto-start next phase" on={config.autoStart} onClick={() => onUpdateConfig('autoStart', !config.autoStart)} />
              <Toggle label="Chime on phase end" on={config.chime} onClick={() => onUpdateConfig('chime', !config.chime)} />
              <Toggle label="Browser notification" on={config.notify} onClick={() => onUpdateConfig('notify', !config.notify)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Local phase-length lookup mirroring lib/pomodoro's phaseLengthMin, kept inline
// so the view has no engine dependency beyond PHASES/mmss.
function phaseLen(config, phase) {
  if (phase === 'short') return config.shortMin;
  if (phase === 'long') return config.longMin;
  return config.focusMin;
}

// ── Small presentational helpers ──────────────────────────────────────────────
const sectionLabel = {
  fontSize: '10px',
  letterSpacing: '.09em',
  color: 'rgba(231,233,238,.4)',
  fontWeight: 700,
  textTransform: 'uppercase',
  marginBottom: '8px',
  fontFamily: "'JetBrains Mono',monospace",
};
const selectStyle = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: '10px',
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.12)',
  color: '#e7e9ee',
  fontSize: '13px',
  fontFamily: "'Space Grotesk',sans-serif",
  cursor: 'pointer',
};
const clearLinkStyle = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(231,233,238,.5)',
  fontSize: '11px',
  fontFamily: "'JetBrains Mono',monospace",
  cursor: 'pointer',
  flex: 'none',
  textDecoration: 'underline',
};

function IconBtn({ children, onClick, title, active }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '30px',
        height: '30px',
        borderRadius: '8px',
        cursor: 'pointer',
        color: active ? '#a5b4fc' : hover ? '#e7e9ee' : 'rgba(231,233,238,.6)',
        background: active ? 'rgba(99,102,241,.18)' : hover ? 'rgba(255,255,255,.08)' : 'transparent',
        border: active ? '1px solid rgba(99,102,241,.5)' : '1px solid transparent',
      }}
    >
      {children}
    </button>
  );
}

function NumField({ label, value, onChange, wide }) {
  return (
    <label style={{ flex: wide ? 'none' : 1, width: wide ? '100%' : undefined, display: 'block' }}>
      <span style={{ display: 'block', fontSize: '10.5px', color: 'rgba(231,233,238,.5)', marginBottom: '4px', fontFamily: "'JetBrains Mono',monospace" }}>
        {label}
      </span>
      <input
        type="number"
        min="1"
        max="180"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n) && n >= 1 && n <= 180) onChange(n);
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          borderRadius: '9px',
          background: 'rgba(255,255,255,.05)',
          border: '1px solid rgba(255,255,255,.12)',
          color: '#e7e9ee',
          fontSize: '14px',
          fontFamily: "'JetBrains Mono',monospace",
        }}
      />
    </label>
  );
}

function Toggle({ label, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={on}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '4px 2px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: '#e7e9ee',
        fontSize: '13px',
        fontFamily: "'Space Grotesk',sans-serif",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          width: '38px',
          height: '22px',
          borderRadius: '11px',
          background: on ? '#5eead4' : 'rgba(255,255,255,.14)',
          position: 'relative',
          transition: 'background .15s ease',
          flex: 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: on ? '18px' : '2px',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: '#0b0d10',
            transition: 'left .15s ease',
          }}
        />
      </span>
    </button>
  );
}
