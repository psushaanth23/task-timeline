import React from 'react';
import { hexToRgba } from '../lib/color.js';
import { fmt, fmtDateTime, durLabel } from '../lib/time.js';
import { MarkdownView } from './MarkdownNotes.jsx';
import RichTitle from './RichTitle.jsx';
import { isBreakTrack } from '../lib/constants.js';

// Completed page (hash route #/completed): every finished task — still on the
// board or already swept into the backlog — as a vertical timeline, newest
// completion first. Day headers stick while scrolling; older days render in
// batches as you reach the bottom so a long history stays fast.
//
// Entry shape (built in App.completedTasks): { id, title, duration, notes,
// startMs, completedAt (= scheduled end), markedAt, trackName, trackColor }.

const mono = "'JetBrains Mono',ui-monospace,monospace";
const BATCH = 60;

// Phones get a fundamentally different layout: the desktop 4-column grid
// (time · rail · card · duration) crushes the title into a sliver and clips the
// track name to "Ma…". Below this width we drop the grid and stack everything
// inside one full-width card instead. 640px catches phones in both orientations.
const NARROW_MQ = '(max-width: 640px)';

function useIsNarrow() {
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(NARROW_MQ).matches
      : false;
  const [narrow, setNarrow] = React.useState(get);
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(NARROW_MQ);
    const onChange = () => setNarrow(mql.matches);
    onChange();
    // addEventListener('change') is the modern API; addListener is the fallback
    // for older Safari where MediaQueryList isn't an EventTarget yet.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);
  return narrow;
}

// One source of truth for the two widths. Same elements everywhere — only the
// gutters, the time column and a couple of type sizes change.
function metricsFor(narrow) {
  return narrow
    ? { cols: '54px 18px minmax(0,1fr)', rail: 63, head: 76, page: '18px 12px 44px', time: 11, title: 13.5, pad: 11 }
    : { cols: '76px 28px minmax(0,1fr) 108px', rail: 89, head: 110, page: '30px 26px 60px', time: 12, title: 14, pad: 13 };
}

const dayStart = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function dayLabel(ms) {
  const days = Math.round((dayStart(Date.now()) - dayStart(ms)) / 86400000);
  const d = new Date(ms);
  const long = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (days === 0) return { main: 'Today', sub: long };
  if (days === 1) return { main: 'Yesterday', sub: long };
  if (days < 7) return { main: d.toLocaleDateString(undefined, { weekday: 'long' }), sub: long };
  return { main: long, sub: days + ' days ago' };
}

const clockOf = (ms, timeFormat) => {
  const d = new Date(ms);
  return fmt(d.getHours() * 60 + d.getMinutes(), timeFormat);
};

// Idle stretches between completions (same day). For each older → newer pair,
// idle runs from the older task's completion to the earliest estimated START
// (completedAt − duration) of anything finished after it. Only gaps of at least
// IDLE_MIN minutes are shown, so ordinary breaks between tasks stay quiet.
const IDLE_MIN = 30;
const MS_MIN = 60000;

const spanLabel = (ms) => {
  const m = Math.round(ms / MS_MIN);
  const h = Math.floor(m / 60);
  return (h ? h + 'h' : '') + (m % 60 ? (h ? ' ' : '') + (m % 60) + 'm' : h ? '' : '0m');
};

function idleGaps(items) {
  // items: one day, newest first. Returns { [olderIndex]: { from, to } } — the
  // gap sits just above the older item.
  const gaps = {};
  let earliestStart = Infinity;
  for (let i = 0; i < items.length - 1; i++) {
    const it = items[i];
    earliestStart = Math.min(earliestStart, it.completedAt - (it.duration || 0) * MS_MIN);
    const older = items[i + 1];
    const from = older.completedAt;
    const to = earliestStart;
    if (to - from >= IDLE_MIN * MS_MIN) gaps[i + 1] = { from, to };
  }
  return gaps;
}

const AMBER = '251,191,36';
// The "Breaks" timeline is rest the user logged on purpose: indigo, so it reads
// apart from mint (work) and from the amber idle band (time nobody accounted
// for). Matched by name so no extra setting is needed.
const REST = '129,140,248';

function IdleGap({ from, to, timeFormat, m, narrow }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: m.cols, alignItems: 'stretch' }}>
      <div />
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {/* Amber dashed segment replaces the solid rail for the idle stretch. */}
        <span style={{ position: 'absolute', top: 0, bottom: 0, width: '6px', background: '#0a0c11' }} />
        <span style={{ position: 'absolute', top: '2px', bottom: '2px', borderLeft: '2px dashed rgba(' + AMBER + ',.55)' }} />
      </div>
      <div
        style={{
          margin: '4px 0 6px 6px',
          padding: '9px 13px',
          borderRadius: '11px',
          border: '1px dashed rgba(' + AMBER + ',.45)',
          background: 'rgba(' + AMBER + ',.06)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px 12px',
        }}
      >
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '7px',
            background: 'rgba(' + AMBER + ',.12)',
            border: '1px solid rgba(' + AMBER + ',.32)',
            fontFamily: mono,
            fontSize: '13px',
            fontWeight: 600,
            color: '#fde68a',
            whiteSpace: 'nowrap',
          }}
        >
          {clockOf(from, timeFormat)} → {clockOf(to, timeFormat)}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 12px 5px 10px',
            borderRadius: '8px',
            background: '#fbbf24',
            color: '#1a1405',
            fontSize: '14px',
            fontWeight: 800,
            letterSpacing: '.02em',
            whiteSpace: 'nowrap',
            boxShadow: '0 0 0 1px rgba(' + AMBER + ',.5), 0 4px 14px rgba(' + AMBER + ',.18)',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2" />
            <path d="M9 2h6" />
          </svg>
          Idle {spanLabel(to - from)}
        </span>
      </div>
      {!narrow && <div />}
    </div>
  );
}

const CLAY = '#d97757';

const ClaudeSpark = ({ size = 12 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={CLAY}
    aria-label="Claude session"
    role="img"
    style={{ flex: 'none', filter: 'drop-shadow(0 0 4px rgba(217,119,87,.5))' }}
  >
    <path d="M12 2.5c.5 4.2 2.8 6.6 7 7.2-4.2.6-6.5 3-7 7.2-.5-4.2-2.8-6.6-7-7.2 4.2-.6 6.5-3 7-7.2z" />
    <path d="M19 15.5c.25 1.9 1.3 3 3 3.3-1.7.3-2.75 1.4-3 3.3-.25-1.9-1.3-3-3-3.3 1.7-.3 2.75-1.4 3-3.3z" />
  </svg>
);

// A break spans the whole row like a scene break in a story, so the run of work
// cards visibly stops. Solid indigo (logged rest) rather than the dashed amber
// of an idle gap (time nobody accounted for). The rail passes behind it.
function BreakItem({ item, timeFormat, m, narrow }) {
  const [open, setOpen] = React.useState(false);
  const hasNotes = typeof item.notes === 'string' && item.notes.trim().length > 0;
  const startLabel = clockOf(item.startMs, timeFormat);
  const endLabel = clockOf(item.completedAt, timeFormat);

  // Time spent resting. Wide screens give it the same right-hand column the work
  // rows use, but as an indigo pill with a "rest" tag instead of a scale bar —
  // rest isn't measured against the day's longest task. Narrow screens have no
  // fourth column, so the pill rides at the end of the band itself.
  const durPill = (
    <span
      style={{
        flex: 'none',
        fontFamily: mono,
        fontSize: '11.5px',
        fontWeight: 700,
        letterSpacing: '.02em',
        whiteSpace: 'nowrap',
        color: '#c7d2fe',
        background: 'rgba(' + REST + ',.18)',
        border: '1px solid rgba(' + REST + ',.42)',
        borderRadius: '999px',
        padding: '2px 10px',
      }}
    >
      {durLabel(item.duration || 0)}
    </span>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: m.cols, alignItems: 'start' }}>
      <div style={{ gridColumn: narrow ? 'span 3' : 'span 3', minWidth: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: m.cols.split(' ').slice(0, 3).join(' '),
            alignItems: 'center',
            columnGap: narrow ? '5px' : '0px',
            margin: '3px 0 7px',
            padding: narrow ? '8px 10px 8px 0' : '9px 12px 9px 0',
            borderRadius: '11px',
            background: 'linear-gradient(90deg, rgba(' + REST + ',.14), rgba(148,163,184,.06) 70%)',
            border: '1px solid rgba(' + REST + ',.3)',
          }}
        >
          <div style={{ textAlign: 'right', fontFamily: mono, fontSize: m.time + 'px', color: '#c7d2fe', whiteSpace: 'nowrap' }}>{endLabel}</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span
              style={{
                width: narrow ? '16px' : '18px',
                height: narrow ? '16px' : '18px',
                boxSizing: 'border-box',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: narrow ? '9px' : '10px',
                lineHeight: 1,
                color: '#c7d2fe',
                background: '#0c0e17',
                border: '1px solid rgba(' + REST + ',.55)',
              }}
              aria-hidden="true"
            >
              ☾
            </span>
          </div>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 9px', paddingLeft: '6px' }}>
            <span style={{ minWidth: 0, fontSize: narrow ? '12px' : '12.5px', fontWeight: 600, color: '#e0e4f5' }}>
              <em style={{ fontFamily: mono, fontStyle: 'normal', fontSize: '9.5px', letterSpacing: '.05em', color: '#a5b4fc', textTransform: 'uppercase', marginRight: '7px' }}>
                Break
              </em>
              {item.title || 'Break'}
            </span>
            <span style={{ fontFamily: mono, fontSize: '10.5px', color: 'rgba(199,210,254,.5)' }}>
              {startLabel} → {endLabel}
            </span>
            {hasNotes && (
              <button type="button" className={'completed-notes-btn' + (open ? ' is-open' : '')} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                {open ? 'Hide notes' : 'Notes'}
              </button>
            )}
            {narrow && <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>{durPill}</span>}
            {open && hasNotes && (
              <div style={{ flex: '1 1 100%', marginTop: '2px', padding: '2px 10px', borderLeft: '2px solid rgba(' + REST + ',.45)' }}>
                <MarkdownView value={item.notes} />
              </div>
            )}
          </div>
        </div>
      </div>
      {!narrow && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', paddingTop: '13px', paddingLeft: '14px' }}>
          {durPill}
          <span style={{ fontFamily: mono, fontSize: '9.5px', letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(' + REST + ',.6)' }}>rest</span>
        </div>
      )}
    </div>
  );
}

function CompletedItem({ item, timeFormat, maxDuration, m, narrow }) {
  const [open, setOpen] = React.useState(false);
  const [full, setFull] = React.useState(false);
  const hasNotes = typeof item.notes === 'string' && item.notes.trim().length > 0;
  const color = item.trackColor || '#94a3b8';
  const pad = m.pad;
  const padL = item.claudeSession ? pad + 3 : pad;
  const pct = Math.max(4, Math.round(100 * Math.min(1, (item.duration || 0) / (maxDuration || 60))));

  // Track (timeline) the task belongs to — a tinted pill that always shows the
  // whole name. Wide: at the right end of the title line. Narrow: right end of
  // the meta line under it. Same element either way.
  const trackPill = (
    <span
      title={'Track: ' + (item.trackName || 'Untitled track')}
      style={{
        flex: 'none',
        marginLeft: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: narrow ? '22px' : '26px',
        padding: narrow ? '0 9px 0 7px' : '0 11px 0 9px',
        borderRadius: '8px',
        background: hexToRgba(color, 0.14),
        border: '1px solid ' + hexToRgba(color, 0.45),
        color: hexToRgba(color, 1),
        fontFamily: "'Space Grotesk',sans-serif",
        fontSize: narrow ? '11.5px' : '12.5px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ flex: 'none', width: '7px', height: '7px', borderRadius: '2px', background: color }} />
      {item.trackName || 'Untitled track'}
    </span>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: m.cols, alignItems: 'start' }}>
      <div
        title={'Ended ' + fmtDateTime(item.completedAt, timeFormat) + (item.markedAt ? ' · marked done ' + fmtDateTime(item.markedAt, timeFormat) : '')}
        style={{ textAlign: 'right', paddingTop: '13px', fontFamily: mono, fontSize: m.time + 'px', color: 'rgba(231,233,238,.8)', whiteSpace: 'nowrap' }}
      >
        {clockOf(item.completedAt, timeFormat)}
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', paddingTop: '13px' }}>
        <span
          style={{
            width: narrow ? '13px' : '16px',
            height: narrow ? '13px' : '16px',
            borderRadius: '50%',
            boxSizing: 'border-box',
            background: '#0b0e13',
            border: '1.5px solid ' + hexToRgba(color, 0.85),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: hexToRgba(color, 0.95),
          }}
        >
          <svg width={narrow ? 8 : 9} height={narrow ? 8 : 9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="5 12.5 10 17 19 7" />
          </svg>
        </span>
      </div>
      <div
        style={{
          margin: '4px 0 6px 6px',
          paddingTop: '10px',
          paddingRight: pad + 'px',
          paddingBottom: '9px',
          paddingLeft: padL + 'px',
          borderRadius: '11px',
          overflow: 'hidden',
          background: item.claudeSession
            ? 'linear-gradient(180deg, #e08a6a, #c26545) 0 0 / 4px 100% no-repeat, rgba(217,119,87,.05)'
            : 'rgba(255,255,255,.028)',
          border: '1px solid ' + (item.claudeSession ? 'rgba(217,119,87,.28)' : 'rgba(255,255,255,.07)'),
        }}
      >
        {/* Title line. One line by default; click it to read the whole thing. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            role="button"
            tabIndex={0}
            title={full ? 'Click to collapse' : item.title}
            onClick={() => setFull((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFull((v) => !v);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: full ? 'flex-start' : 'center',
              gap: '7px',
              fontSize: m.title + 'px',
              fontWeight: 600,
              color: '#eef0f4',
              cursor: 'pointer',
            }}
          >
            {item.claudeSession && <ClaudeSpark size={narrow ? 11 : 12} />}
            <span
              style={
                full
                  ? { minWidth: 0, overflowWrap: 'break-word' }
                  : { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
              }
            >
              <RichTitle text={item.title} />
            </span>
          </div>
          {!narrow && trackPill}
        </div>

        <div
          style={{
            marginTop: '5px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px 10px',
            fontFamily: mono,
            fontSize: '11px',
            color: 'rgba(231,233,238,.5)',
          }}
        >
          <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {narrow ? clockOf(item.startMs, timeFormat) : fmtDateTime(item.startMs, timeFormat)} → {clockOf(item.completedAt, timeFormat)}
          </span>
          {hasNotes && (
            <button type="button" className={'completed-notes-btn' + (open ? ' is-open' : '')} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 3h11l5 5v13H4z" />
                <path d="M14 3v5h5" />
              </svg>
              {open ? 'Hide notes' : 'Notes'}
            </button>
          )}
          {/* Phone: time spent sits right above the right end of the bar below.
              Wide screens keep it in its own column outside the card. */}
          {narrow && (
            <span style={{ marginLeft: 'auto', flex: 'none', fontSize: '11.5px', fontWeight: 600, color: 'rgba(231,233,238,.82)', whiteSpace: 'nowrap' }}>
              {durLabel(item.duration || 0)}
            </span>
          )}
        </div>

        {narrow && <div style={{ marginTop: '7px', display: 'flex' }}>{trackPill}</div>}

        {open && hasNotes && (
          <div style={{ marginTop: '10px', padding: '2px 12px', borderLeft: '2px solid ' + hexToRgba(color, 0.5), background: 'rgba(8,12,18,.4)', borderRadius: '0 8px 8px 0' }}>
            <MarkdownView value={item.notes} />
          </div>
        )}

        {/* Time spent: label at the right end, thin bar along the card's bottom
            edge (full bleed via negative margins) sized against the day's longest. */}
        {narrow && (
          <div style={{ marginTop: '8px', marginLeft: -padL + 'px', marginRight: -pad + 'px', marginBottom: '-9px' }}>
            <div style={{ height: '4px', background: 'rgba(255,255,255,.06)' }}>
              <div
                style={{
                  width: pct + '%',
                  height: '100%',
                  background: 'linear-gradient(90deg, ' + hexToRgba(color, 0.4) + ', ' + hexToRgba(color, 0.95) + ')',
                }}
              />
            </div>
          </div>
        )}
      </div>
      {/* Wide screens: time spent as its own indicator, outside the card. */}
      {!narrow && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', paddingTop: '16px', paddingLeft: '14px' }}>
          <span style={{ fontFamily: mono, fontSize: '12.5px', fontWeight: 600, color: 'rgba(231,233,238,.82)', whiteSpace: 'nowrap' }}>
            {durLabel(item.duration || 0)}
          </span>
          <span style={{ position: 'relative', width: '84px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: Math.max(8, Math.round((84 * pct) / 100)) + 'px',
                borderRadius: '2px',
                background: 'linear-gradient(90deg, ' + hexToRgba(color, 0.4) + ', ' + hexToRgba(color, 0.95) + ')',
              }}
            />
          </span>
        </div>
      )}
    </div>
  );
}

// Per-day totals under the sticky day header: how long was spent working, how
// much of the day was logged rest, and how much went unaccounted — three
// figures, one three-part bar, one legend. Breaks never count as focus.
function DaySummary({ group, gaps, m, narrow }) {
  const focused = group.work.reduce((n, it) => n + (it.duration || 0), 0);
  const rest = group.breaks.reduce((n, it) => n + (it.duration || 0), 0);
  const idle = Object.keys(gaps).reduce((n, k) => n + Math.round((gaps[k].to - gaps[k].from) / MS_MIN), 0);
  const total = Math.max(1, focused + rest + idle);
  const pct = (n) => (100 * n) / total;

  const stats = [
    { key: 'f', value: spanLabel(focused * MS_MIN), label: 'focused', color: '#a7f3d0', dim: 'rgba(167,243,208,.55)' },
  ];
  if (rest > 0) stats.push({ key: 'b', value: spanLabel(rest * MS_MIN), label: 'break', color: '#c7d2fe', dim: 'rgba(199,210,254,.55)' });
  if (idle > 0) stats.push({ key: 'i', value: spanLabel(idle * MS_MIN), label: 'idle', color: '#fbbf24', dim: 'rgba(251,191,36,.55)' });

  const legend = [{ key: 'f', c: '#34d399', t: 'focused ' + focused + 'm' }];
  if (rest > 0) legend.push({ key: 'b', c: '#818cf8', t: 'break ' + rest + 'm' });
  if (idle > 0) legend.push({ key: 'i', c: '#fbbf24', t: 'idle ' + idle + 'm' });

  // Deliberately NOT shaped like a task card: it spans the full width (tasks are
  // indented past the time column), sits on the page's mint accent instead of the
  // neutral card surface, and is opaque so the rail passes behind it.
  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div
        style={{
          margin: '2px 0 12px',
          padding: narrow ? '10px 12px' : '11px 15px',
          borderRadius: '13px',
          background: 'linear-gradient(90deg, rgba(110,231,183,.13), rgba(110,231,183,.04) 62%), #0b1014',
          border: '1px solid rgba(110,231,183,.26)',
          boxShadow: '0 1px 0 rgba(110,231,183,.06) inset, 0 8px 22px rgba(0,0,0,.35)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', fontFamily: mono, fontSize: narrow ? '12px' : '12.5px', whiteSpace: 'nowrap' }}>
          {stats.map((st, i) => (
            <span
              key={st.key}
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: '5px',
                paddingRight: '12px',
                borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none',
              }}
            >
              <b style={{ fontWeight: 700, color: st.color }}>{st.value}</b>
              <span style={{ fontSize: '10px', letterSpacing: '.03em', color: st.dim }}>{st.label}</span>
            </span>
          ))}
          <span
            style={{
              marginLeft: 'auto',
              padding: '2px 8px',
              borderRadius: '7px',
              background: 'rgba(110,231,183,.1)',
              border: '1px solid rgba(110,231,183,.22)',
              color: '#a7f3d0',
              fontWeight: 700,
            }}
          >
            {group.work.length} <span style={{ fontSize: '10px', fontWeight: 400, color: 'rgba(167,243,208,.55)' }}>done</span>
          </span>
        </div>
        <div style={{ display: 'flex', height: '5px', borderRadius: '3px', overflow: 'hidden', margin: '10px 0 7px', background: 'rgba(255,255,255,.05)' }}>
          <span style={{ width: pct(focused) + '%', background: 'linear-gradient(90deg,#6ee7b7,#34d399)' }} />
          {rest > 0 && <span style={{ width: pct(rest) + '%', background: '#818cf8' }} />}
          {idle > 0 && (
            <span style={{ width: pct(idle) + '%', background: 'repeating-linear-gradient(90deg,#fbbf24 0 3px,rgba(251,191,36,.28) 3px 6px)' }} />
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 11px', fontFamily: mono, fontSize: '9.5px', letterSpacing: '.04em', color: 'rgba(231,233,238,.4)' }}>
          {legend.map((l) => (
            <span key={l.key}>
              <em style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '2px', marginRight: '4px', background: l.c }} />
              {l.t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CompletedPage({ items, timeFormat, onBack }) {
  const list = Array.isArray(items) ? items : [];
  const narrow = useIsNarrow();
  const m = metricsFor(narrow);
  const [shown, setShown] = React.useState(BATCH);
  const [collapsed, setCollapsed] = React.useState(false);
  const scrollRef = React.useRef(null);
  const sentinelRef = React.useRef(null);

  // Reveal older completions in batches as the bottom comes into view.
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || shown >= list.length || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + BATCH);
      },
      { root: scrollRef.current, rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, list.length]);

  const visible = list.slice(0, shown);
  const groups = [];
  visible.forEach((it) => {
    const key = dayStart(it.completedAt);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: dayLabel(it.completedAt), items: [], work: [], breaks: [], maxDuration: 0 };
      groups.push(g);
    }
    g.items.push(it);
    if (isBreakTrack(it.trackName)) {
      g.breaks.push(it);
    } else {
      g.work.push(it);
      // Scale the mini-bars against the longest piece of WORK, so an hour of
      // lunch doesn't flatten every task bar on the day.
      g.maxDuration = Math.max(g.maxDuration, it.duration || 0);
    }
  });
  const today = list.filter((it) => dayStart(it.completedAt) === dayStart(Date.now())).length;

  const pageStyle = {
    position: 'absolute',
    inset: 0,
    zIndex: 60,
    overflowY: 'auto',
    background:
      'radial-gradient(150% 78% at 50% 132%, rgba(34,120,96,0.18), rgba(14,40,32,0.08) 40%, rgba(9,12,17,0) 62%),' +
      'radial-gradient(1000px 520px at 6% -12%, rgba(52,211,153,0.07), transparent 60%),' +
      'linear-gradient(180deg, #090a0e 0%, #0a0c11 55%, #0b1016 100%)',
    color: '#e7e9ee',
    fontFamily: "'Space Grotesk',sans-serif",
  };
  const backBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.14)',
    borderRadius: '9px',
    color: 'rgba(231,233,238,.8)',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: mono,
  };

  return (
    <div style={pageStyle} ref={scrollRef}>
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: m.page }}>
        <button type="button" style={backBtnStyle} onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to timeline
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: (narrow ? '16px' : '22px') + ' 0 4px' }}>
          <h1
            style={{
              margin: 0,
              fontSize: narrow ? '20px' : '24px',
              fontFamily: mono,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              background: 'linear-gradient(90deg,#ecfdf5,#6ee7b7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Completed
          </h1>
          {list.length > 0 && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              aria-pressed={collapsed}
              title={collapsed ? 'Show every task' : 'Collapse tasks — show only daily summaries'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 11px',
                borderRadius: '9px',
                cursor: 'pointer',
                fontFamily: mono,
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                color: collapsed ? '#a7f3d0' : 'rgba(231,233,238,.8)',
                background: collapsed ? 'rgba(110,231,183,.12)' : 'rgba(255,255,255,.05)',
                border: '1px solid ' + (collapsed ? 'rgba(110,231,183,.42)' : 'rgba(255,255,255,.14)'),
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {collapsed ? (
                  <>
                    <polyline points="6 9 12 15 18 9" />
                  </>
                ) : (
                  <>
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="20" y2="17" />
                  </>
                )}
              </svg>
              {collapsed ? 'Show tasks' : 'Summaries only'}
            </button>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(231,233,238,.5)', fontFamily: mono }}>
          {list.length ? list.length + ' finished' + (today ? ' · ' + today + ' today' : '') + ' · newest first' : 'Nothing finished yet'}
        </p>

        {list.length === 0 ? (
          <div style={{ marginTop: '40px', padding: '48px 24px', textAlign: 'center', border: '1px dashed rgba(255,255,255,.14)', borderRadius: '14px', background: 'rgba(255,255,255,.02)' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(231,233,238,.75)' }}>No completed tasks</div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: 'rgba(231,233,238,.45)', fontFamily: mono }}>
              Mark a task done on the board and it shows up here.
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', marginTop: '18px' }}>
            {/* The rail the completion nodes sit on. Hidden when collapsed to
                summaries, since there are no nodes for it to connect. */}
            {!collapsed && (
              <div style={{ position: 'absolute', left: m.rail + 'px', top: '8px', bottom: '8px', width: '2px', borderRadius: '1px', background: 'linear-gradient(180deg, rgba(110,231,183,.35), rgba(255,255,255,.06))' }} />
            )}
            {groups.map((g, gi) => (
              <section key={g.key} style={{ position: 'relative' }}>
                {gi > 0 && (
                  <div
                    role="separator"
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      height: '1px',
                      margin: '22px 0 2px',
                      background: 'linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.26) 12%, rgba(255,255,255,.26) 88%, rgba(255,255,255,.04))',
                    }}
                  />
                )}
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '10px',
                    padding: '14px 0 8px ' + m.head + 'px',
                    background: 'linear-gradient(180deg, rgba(9,10,14,.96) 70%, rgba(9,10,14,0))',
                  }}
                >
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#eef0f4', fontFamily: mono }}>{g.label.main}</span>
                  <span style={{ fontSize: '11.5px', color: 'rgba(231,233,238,.42)', fontFamily: mono }}>
                    {g.label.sub} · {g.work.length} done
                  </span>
                </div>
                {(() => {
                  const gaps = idleGaps(g.items);
                  return (
                    <React.Fragment>
                      <DaySummary group={g} gaps={gaps} m={m} narrow={narrow} />
                      {!collapsed &&
                        g.items.map((it, i) => (
                          <React.Fragment key={it.id}>
                            {gaps[i] && <IdleGap from={gaps[i].from} to={gaps[i].to} timeFormat={timeFormat} m={m} narrow={narrow} />}
                            {isBreakTrack(it.trackName) ? (
                              <BreakItem item={it} timeFormat={timeFormat} m={m} narrow={narrow} />
                            ) : (
                              <CompletedItem item={it} timeFormat={timeFormat} maxDuration={g.maxDuration} m={m} narrow={narrow} />
                            )}
                          </React.Fragment>
                        ))}
                    </React.Fragment>
                  );
                })()}
              </section>
            ))}
            {shown < list.length && (
              <div ref={sentinelRef} style={{ padding: '18px 0 0 ' + m.head + 'px', fontFamily: mono, fontSize: '11.5px', color: 'rgba(231,233,238,.4)' }}>
                Loading older…
              </div>
            )}
            {shown >= list.length && list.length > BATCH && (
              <div style={{ padding: '18px 0 0 ' + m.head + 'px', fontFamily: mono, fontSize: '11.5px', color: 'rgba(231,233,238,.35)' }}>That’s everything.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
