import React from 'react';
import { hexToRgba } from '../lib/color.js';
import { fmtDateTime, durLabel, MS_PER_MIN } from '../lib/time.js';
import { MarkdownView } from './MarkdownNotes.jsx';

// The Deleted Tracks archive page (hash route #/archive). Lists soft-deleted
// tracks (most-recent first) with their color accent, name, tags, task count
// and deletion time, and lets the user restore or permanently remove each one.
// #88: each card is expandable to reveal its archived tasks (title, time/
// duration, done + finish time, has-notes hint) and an inline READ-ONLY Markdown
// preview (same react-markdown + remark-gfm + rehype-highlight renderer as the
// live notes panel). On-theme dark glass; self-contained so the main timeline
// UI is untouched.
function formatDeletedAt(ms) {
  try {
    return new Date(ms).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (e) {
    return '';
  }
}

// A single archived task row: title, absolute time + duration, done/finish
// stamp, has-notes hint, and (when it has notes) an inline read-only Markdown
// preview. Archived tasks keep the in-memory shape (start = minute offset from
// originMs, duration in minutes, done, completedAt epoch, notes string).
export function ArchivedTaskRow({ task, originMs, timeFormat, accent }) {
  const hasNotes = !!(task.notes && task.notes.trim());
  const startMs = originMs + Math.round(task.start) * MS_PER_MIN;
  const timeLabel = fmtDateTime(startMs, timeFormat);
  const finishLabel = task.done ? fmtDateTime(task.completedAt, timeFormat) : null;
  return (
    <div
      style={{
        padding: '11px 13px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(255,255,255,.07)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span
          aria-hidden="true"
          style={{
            flex: 'none',
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            marginTop: '1px',
            background: task.done ? '#2dd4bf' : hexToRgba(accent, 0.85),
            boxShadow: task.done ? '0 0 8px rgba(45,212,191,.6)' : 'none',
          }}
        />
        <span
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            fontSize: '13.5px',
            fontWeight: 600,
            color: 'rgba(231,233,238,.9)',
            textDecoration: task.done ? 'line-through' : 'none',
            opacity: task.done ? 0.72 : 1,
          }}
        >
          {task.title || 'Untitled task'}
        </span>
        {hasNotes && (
          <span
            title="Has notes"
            style={{
              flex: 'none',
              fontSize: '10.5px',
              fontWeight: 600,
              color: '#7dd3fc',
              background: 'rgba(125,211,252,.14)',
              border: '1px solid rgba(125,211,252,.4)',
              borderRadius: '999px',
              padding: '1px 7px',
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            NOTES
          </span>
        )}
      </div>
      <div
        style={{
          marginTop: '5px',
          marginLeft: '17px',
          fontSize: '11.5px',
          color: 'rgba(231,233,238,.5)',
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        {timeLabel || 'unscheduled'} · {durLabel(task.duration || 0)}
        {task.done && (
          <span style={{ color: '#5eead4' }}>
            {'  ✓ done' + (finishLabel ? ' · ' + finishLabel : '')}
          </span>
        )}
      </div>
      {hasNotes && (
        <div
          style={{
            marginTop: '9px',
            marginLeft: '17px',
            padding: '2px 12px',
            borderLeft: '2px solid ' + hexToRgba(accent, 0.5),
            background: 'rgba(8,12,18,.4)',
            borderRadius: '0 8px 8px 0',
          }}
        >
          <MarkdownView value={task.notes} />
        </div>
      )}
    </div>
  );
}

export default function ArchivePage({ deletedTracks, tags, originMs, timeFormat, onRestore, onPurge, onBack }) {
  const [expanded, setExpanded] = React.useState({});
  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const list = Array.isArray(deletedTracks) ? deletedTracks : [];
  const tagsById = {};
  (tags || []).forEach((t) => {
    tagsById[t.id] = t;
  });
  const sorted = [...list].sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

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
    fontFamily: "'JetBrains Mono',monospace",
  };
  const cardStyle = {
    position: 'relative',
    marginTop: '12px',
    background: 'rgba(18,20,28,0.62)',
    backdropFilter: 'blur(12px) saturate(150%)',
    WebkitBackdropFilter: 'blur(12px) saturate(150%)',
    border: '1px solid rgba(255,255,255,.09)',
    borderRadius: '13px',
    overflow: 'hidden',
  };
  const headerRowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px 18px 16px 22px',
  };
  const actionBtn = (accent) => ({
    background: hexToRgba(accent, 0.14),
    border: '1px solid ' + hexToRgba(accent, 0.5),
    color: accent,
    borderRadius: '9px',
    padding: '8px 14px',
    fontSize: '12.5px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: "'JetBrains Mono',monospace",
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

        <h1
          style={{
            margin: '22px 0 4px',
            fontSize: '24px',
            fontFamily: "'Orbitron','Space Grotesk',sans-serif",
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            background: 'linear-gradient(90deg,#e7fbff,#7dd3fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Deleted Tracks
        </h1>
        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(231,233,238,.5)', fontFamily: "'JetBrains Mono',monospace" }}>
          {sorted.length ? sorted.length + ' archived track' + (sorted.length === 1 ? '' : 's') + ' · restore to bring it back' : 'Nothing here yet'}
        </p>

        {sorted.length === 0 ? (
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
            <div style={{ fontSize: '34px', opacity: 0.5 }}>🗑️</div>
            <div style={{ marginTop: '10px', fontSize: '15px', fontWeight: 600, color: 'rgba(231,233,238,.75)' }}>
              No deleted tracks
            </div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: 'rgba(231,233,238,.45)', fontFamily: "'JetBrains Mono',monospace" }}>
              Tracks you delete from the timeline show up here and can be restored.
            </div>
          </div>
        ) : (
          sorted.map((d) => {
            const tagList = (d.tagIds || []).map((id) => tagsById[id]).filter(Boolean);
            const taskList = Array.isArray(d.tasks) ? d.tasks : [];
            const taskCount = taskList.length;
            const notedCount = taskList.filter((t) => t.notes && t.notes.trim()).length;
            const isOpen = !!expanded[d.id];
            const canExpand = taskCount > 0;
            // Tasks earliest-first for a natural reading order.
            const orderedTasks = [...taskList].sort((a, b) => (a.start || 0) - (b.start || 0));
            return (
              <div key={d.id} style={cardStyle}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '4px',
                    background: d.color,
                    boxShadow: '0 0 12px ' + d.color + '77',
                  }}
                />
                <div
                  style={{ ...headerRowStyle, cursor: canExpand ? 'pointer' : 'default' }}
                  onClick={canExpand ? () => toggle(d.id) : undefined}
                  role={canExpand ? 'button' : undefined}
                  aria-expanded={canExpand ? isOpen : undefined}
                >
                  {canExpand ? (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{
                        flex: 'none',
                        color: 'rgba(231,233,238,.55)',
                        transform: isOpen ? 'rotate(90deg)' : 'none',
                        transition: 'transform .15s ease',
                      }}
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  ) : (
                    <span style={{ flex: 'none', width: '15px' }} aria-hidden="true" />
                  )}
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div style={{ fontSize: '16px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.name}
                    </div>
                    <div style={{ marginTop: '5px', fontSize: '12px', color: 'rgba(231,233,238,.5)', fontFamily: "'JetBrains Mono',monospace" }}>
                      {taskCount} task{taskCount === 1 ? '' : 's'}
                      {notedCount > 0 ? ' · ' + notedCount + ' with notes' : ''} · deleted {formatDeletedAt(d.deletedAt)}
                    </div>
                    {tagList.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {tagList.map((tag) => (
                          <span
                            key={tag.id}
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '1px 8px',
                              borderRadius: '999px',
                              color: tag.color,
                              background: hexToRgba(tag.color, 0.16),
                              border: '1px solid ' + hexToRgba(tag.color, 0.5),
                            }}
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button type="button" style={actionBtn('#2dd4bf')} onClick={() => onRestore(d.id)}>
                      Restore
                    </button>
                    <button type="button" style={actionBtn('#ff7a95')} onClick={() => onPurge(d.id)} title="Delete permanently">
                      Delete
                    </button>
                  </div>
                </div>
                {isOpen && canExpand && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '4px 18px 18px 43px',
                      borderTop: '1px solid rgba(255,255,255,.06)',
                    }}
                  >
                    <div style={{ height: '4px' }} />
                    {orderedTasks.map((task) => (
                      <ArchivedTaskRow
                        key={task.id}
                        task={task}
                        originMs={originMs}
                        timeFormat={timeFormat}
                        accent={d.color}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
