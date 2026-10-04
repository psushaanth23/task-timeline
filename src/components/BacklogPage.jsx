import React from 'react';
import { hexToRgba } from '../lib/color.js';
import { fmtDateTime, durLabel } from '../lib/time.js';
import { MarkdownView } from './MarkdownNotes.jsx';
import RichTitle from './RichTitle.jsx';

// #96: the Backlog page (hash route #/backlog).
//
// The board is a fixed 48h window anchored to today's local midnight, so any
// task scheduled for an earlier day (or beyond the far edge) has nowhere to
// render. Instead of disappearing, those tasks are swept in here — on load and
// on day rollover — keeping their absolute time, notes and done state. From
// here each one can be pulled back onto today (it lands on the next 10-minute
// boundary after now, in its original track when that track still exists) or
// dropped for good.
//
// Entries are the absolute shape: { id, title, duration, done, completedAt,
// notes, startMs, trackId, trackName, trackColor, backloggedAt }.

// "3 days ago" / "in 2 days" — how far the entry's scheduled time is from now.
function relativeDayLabel(ms) {
  if (ms == null || !isFinite(ms)) return '';
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const days = Math.round((startOfDay(ms) - startOfDay(Date.now())) / 86400000);
  if (days === 0) return 'today';
  if (days === -1) return 'yesterday';
  if (days === 1) return 'tomorrow';
  if (days < 0) return -days + ' days ago';
  return 'in ' + days + ' days';
}

// Group entries by the calendar day they were scheduled for, newest first, so a
// long backlog reads as a stack of days rather than an undifferentiated list.
function groupByDay(entries) {
  const groups = new Map();
  entries.forEach((e) => {
    const d = new Date(e.startMs);
    const key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        ms: e.startMs,
        label: d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        rel: relativeDayLabel(e.startMs),
        items: [],
      });
    }
    groups.get(key).items.push(e);
  });
  return [...groups.values()].sort((a, b) => b.ms - a.ms);
}

const mono = "'JetBrains Mono',monospace";

function BacklogRow({ entry, accent, timeFormat, trackLive, onRestore, onDrop }) {
  const [open, setOpen] = React.useState(false);
  const hasNotes = !!(entry.notes && entry.notes.trim());
  const timeLabel = fmtDateTime(entry.startMs, timeFormat);
  const actionBtn = (color) => ({
    background: hexToRgba(color, 0.14),
    border: '1px solid ' + hexToRgba(color, 0.5),
    color,
    borderRadius: '9px',
    padding: '7px 13px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: mono,
  });
  return (
    <div
      style={{
        position: 'relative',
        padding: '13px 15px 13px 19px',
        borderRadius: '11px',
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.07)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: '10px',
          bottom: '10px',
          width: '3px',
          borderRadius: '3px',
          background: accent,
          boxShadow: '0 0 10px ' + hexToRgba(accent, 0.5),
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px' }}>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'rgba(231,233,238,.92)',
                textDecoration: entry.done ? 'line-through' : 'none',
                opacity: entry.done ? 0.7 : 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <RichTitle text={entry.title || 'Untitled task'} />
            </span>
            {entry.done && (
              <span style={{ flex: 'none', fontSize: '11px', color: '#5eead4', fontFamily: mono }}>
                ✓ done
              </span>
            )}
          </div>
          <div style={{ marginTop: '5px', fontSize: '11.5px', color: 'rgba(231,233,238,.5)', fontFamily: mono }}>
            {timeLabel} · {durLabel(entry.duration || 0)} ·{' '}
            <span style={{ color: hexToRgba(accent, 0.9) }}>{entry.trackName}</span>
            {!trackLive && (
              <span style={{ color: 'rgba(255,183,77,.9)' }}> · track gone → first lane</span>
            )}
            {hasNotes && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                style={{
                  marginLeft: '9px',
                  background: 'rgba(125,211,252,.14)',
                  border: '1px solid rgba(125,211,252,.4)',
                  color: '#7dd3fc',
                  borderRadius: '999px',
                  padding: '1px 8px',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: mono,
                }}
              >
                {open ? 'HIDE NOTES' : 'NOTES'}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' }}>
          <button
            type="button"
            style={actionBtn('#2dd4bf')}
            onClick={() => onRestore(entry.id)}
            title="Put this back on today's board, starting at the next 10-minute slot"
          >
            Restore to now
          </button>
          <button
            type="button"
            style={actionBtn('#ff7a95')}
            onClick={() => onDrop(entry.id)}
            title="Remove permanently"
          >
            Drop
          </button>
        </div>
      </div>
      {open && hasNotes && (
        <div
          style={{
            marginTop: '10px',
            padding: '2px 12px',
            borderLeft: '2px solid ' + hexToRgba(accent, 0.5),
            background: 'rgba(8,12,18,.4)',
            borderRadius: '0 8px 8px 0',
          }}
        >
          <MarkdownView value={entry.notes} />
        </div>
      )}
    </div>
  );
}

export default function BacklogPage({
  entries,
  tracks,
  timeFormat,
  onRestore,
  onRestoreAll,
  onDrop,
  onClear,
  onBack,
}) {
  const list = Array.isArray(entries) ? entries : [];
  const liveTrackIds = new Set((tracks || []).map((t) => t.id));
  const groups = groupByDay(list);
  const pending = list.filter((e) => !e.done).length;

  const pageStyle = {
    position: 'absolute',
    inset: 0,
    zIndex: 60,
    overflowY: 'auto',
    background:
      'radial-gradient(150% 78% at 50% 132%, rgba(34,102,120,0.22), rgba(14,32,46,0.10) 40%, rgba(9,12,17,0) 62%),' +
      'radial-gradient(1000px 520px at 6% -12%, rgba(99,102,241,0.10), transparent 60%),' +
      'linear-gradient(180deg, #090a0e 0%, #0a0c11 55%, #0b1016 100%)',
    color: '#e7e9ee',
    fontFamily: "'Space Grotesk',sans-serif",
  };
  const innerStyle = { maxWidth: '820px', margin: '0 auto', padding: '30px 26px 60px' };
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
  const bulkBtn = (color) => ({
    background: hexToRgba(color, 0.14),
    border: '1px solid ' + hexToRgba(color, 0.5),
    color,
    borderRadius: '9px',
    padding: '8px 14px',
    fontSize: '12.5px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: mono,
  });

  return (
    <div style={pageStyle}>
      <div style={innerStyle}>
        <button type="button" style={backBtnStyle} onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to timeline
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h1
              style={{
                margin: '22px 0 4px',
                fontSize: '24px',
                fontFamily: mono,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                background: 'linear-gradient(90deg,#e7fbff,#7dd3fc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Backlog
            </h1>
            <p style={{ margin: 0, fontSize: '13px', color: 'rgba(231,233,238,.5)', fontFamily: mono }}>
              {list.length
                ? list.length +
                  ' task' +
                  (list.length === 1 ? '' : 's') +
                  ' off the board' +
                  (pending ? ' · ' + pending + ' still open' : '')
                : 'Nothing here yet'}
            </p>
          </div>
          {list.length > 0 && (
            <div style={{ display: 'flex', gap: '9px', flex: 'none' }}>
              <button type="button" style={bulkBtn('#2dd4bf')} onClick={onRestoreAll}>
                Restore all
              </button>
              <button type="button" style={bulkBtn('#ff7a95')} onClick={onClear}>
                Clear
              </button>
            </div>
          )}
        </div>

        {list.length === 0 ? (
          <div
            style={{
              marginTop: '40px',
              padding: '48px 24px',
              textAlign: 'center',
              border: '1px dashed rgba(255,255,255,.14)',
              borderRadius: '14px',
              background: 'rgba(255,255,255,.02)',
            }}
          >
            <div style={{ fontSize: '34px', opacity: 0.5 }}>🗂️</div>
            <div style={{ marginTop: '10px', fontSize: '15px', fontWeight: 600, color: 'rgba(231,233,238,.75)' }}>
              Backlog is empty
            </div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: 'rgba(231,233,238,.45)', fontFamily: mono }}>
              Tasks that fall off the board land here, ready to be pulled back to now.
            </div>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key} style={{ marginTop: '26px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '10px',
                  paddingBottom: '9px',
                  borderBottom: '1px solid rgba(255,255,255,.08)',
                }}
              >
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'rgba(231,233,238,.85)', fontFamily: mono }}>
                  {g.label}
                </span>
                <span style={{ fontSize: '11.5px', color: 'rgba(231,233,238,.42)', fontFamily: mono }}>
                  {g.rel} · {g.items.length} task{g.items.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                {g.items
                  .slice()
                  .sort((a, b) => (a.startMs || 0) - (b.startMs || 0))
                  .map((entry) => (
                    <BacklogRow
                      key={entry.id}
                      entry={entry}
                      accent={entry.trackColor || '#8891a5'}
                      timeFormat={timeFormat}
                      trackLive={liveTrackIds.has(entry.trackId)}
                      onRestore={onRestore}
                      onDrop={onDrop}
                    />
                  ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
