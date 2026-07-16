import React from 'react';
import { hexToRgba } from '../lib/color.js';
import TagChip from './TagChip.jsx';

// Tasks-by-tag page (hash route #/tag/<tagId>). Tags live on TRACKS, so the
// rows are every task whose track carries the selected tag (computed in App).
// A tag rail across the top switches the active tag (updates the hash route);
// the main list shows each task with its track accent, time span, done state
// and a has-notes hint. On-theme dark glass, matching TagManagerPage/ArchivePage.
export default function TagTasksPage({ tags, selectedTagId, rows, onSelectTag, onBack }) {
  const list = Array.isArray(tags) ? tags : [];
  const selected = list.find((t) => t.id === selectedTagId) || null;
  const accent = selected ? selected.color : '#7dd3fc';

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
  const railStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '18px',
    padding: '14px 16px',
    background: 'rgba(18,20,28,0.55)',
    backdropFilter: 'blur(12px) saturate(150%)',
    WebkitBackdropFilter: 'blur(12px) saturate(150%)',
    border: '1px solid rgba(255,255,255,.09)',
    borderRadius: '13px',
  };

  const rail = list.map((tag) => {
    const active = tag.id === selectedTagId;
    return (
      <button
        key={tag.id}
        type="button"
        onClick={() => !active && onSelectTag(tag.id)}
        title={active ? tag.label + ' (current)' : 'View tasks for ' + tag.label}
        aria-pressed={active}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 11px',
          borderRadius: '999px',
          cursor: active ? 'default' : 'pointer',
          fontSize: '12.5px',
          fontWeight: 600,
          fontFamily: "'Space Grotesk',sans-serif",
          color: active ? '#0a0c11' : tag.color,
          background: active ? tag.color : hexToRgba(tag.color, 0.14),
          border: '1px solid ' + hexToRgba(tag.color, active ? 1 : 0.5),
          boxShadow: active ? '0 0 12px ' + hexToRgba(tag.color, 0.55) : 'none',
        }}
      >
        {tag.label}
      </button>
    );
  });

  const doneCount = rows.filter((r) => r.done).length;

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
            background: 'linear-gradient(90deg,#e7fbff,' + accent + ')',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {selected ? selected.label : 'Tag'} · Tasks
        </h1>
        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(231,233,238,.5)', fontFamily: "'JetBrains Mono',monospace" }}>
          {selected
            ? rows.length + ' task' + (rows.length === 1 ? '' : 's') +
              ' on tracks tagged “' + selected.label + '”' +
              (doneCount ? ' · ' + doneCount + ' done' : '')
            : 'Tag not found'}
        </p>

        {list.length > 0 && <div style={railStyle}>{rail}</div>}

        {rows.length === 0 ? (
          <div
            style={{
              marginTop: '20px',
              padding: '48px 24px',
              textAlign: 'center',
              border: '1px dashed rgba(255,255,255,.14)',
              borderRadius: '14px',
              background: 'rgba(255,255,255,.02)',
            }}
          >
            <div style={{ fontSize: '34px', opacity: 0.5 }}>🗂️</div>
            <div style={{ marginTop: '10px', fontSize: '15px', fontWeight: 600, color: 'rgba(231,233,238,.75)' }}>
              No tasks for this tag yet
            </div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: 'rgba(231,233,238,.45)', fontFamily: "'JetBrains Mono',monospace" }}>
              Assign this tag to a track, then its tasks show up here.
            </div>
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '13px 16px 13px 22px',
                marginTop: '11px',
                background: r.done ? 'rgba(12,14,20,0.55)' : 'rgba(18,20,28,0.62)',
                backdropFilter: 'blur(12px) saturate(150%)',
                WebkitBackdropFilter: 'blur(12px) saturate(150%)',
                border: '1px solid rgba(255,255,255,.09)',
                borderRadius: '13px',
                opacity: r.done ? 0.62 : 1,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '14%',
                  bottom: '14%',
                  width: '4px',
                  borderRadius: '0 3px 3px 0',
                  background: r.trackColor,
                  boxShadow: '0 0 12px ' + hexToRgba(r.trackColor, 0.47),
                }}
              />
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '14.5px',
                    fontWeight: 600,
                    color: '#e7e9ee',
                    textDecoration: r.done ? 'line-through' : 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={r.title}
                >
                  {r.title || 'Untitled task'}
                </div>
                <div
                  style={{
                    marginTop: '5px',
                    fontSize: '12px',
                    color: 'rgba(231,233,238,.55)',
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {r.timeLabel}
                </div>
              </div>
              <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '9px' }}>
                {r.hasNotes && (
                  <span
                    title="Has notes"
                    aria-label="Has notes"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '22px',
                      height: '22px',
                      borderRadius: '6px',
                      color: '#5eead4',
                      background: 'rgba(94,234,212,.16)',
                      boxShadow: '0 0 7px rgba(94,234,212,.45)',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 5h16M4 10h16M4 15h10" />
                    </svg>
                  </span>
                )}
                {r.done && (
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(231,233,238,.55)',
                      border: '1px solid rgba(255,255,255,.18)',
                      borderRadius: '999px',
                      padding: '2px 8px',
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    Done
                  </span>
                )}
                <TagChip label={r.trackName} color={r.trackColor} title={'Track: ' + r.trackName} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
