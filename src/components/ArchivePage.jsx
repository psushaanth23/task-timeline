import React from 'react';
import { hexToRgba } from '../lib/color.js';

// The Deleted Tracks archive page (hash route #/archive). Lists soft-deleted
// tracks (most-recent first) with their color accent, name, tags, task count
// and deletion time, and lets the user restore or permanently remove each one.
// On-theme dark glass; kept self-contained so the main timeline UI is untouched.
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

export default function ArchivePage({ deletedTracks, tags, onRestore, onPurge, onBack }) {
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
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px 18px 16px 22px',
    marginTop: '12px',
    background: 'rgba(18,20,28,0.62)',
    backdropFilter: 'blur(12px) saturate(150%)',
    WebkitBackdropFilter: 'blur(12px) saturate(150%)',
    border: '1px solid rgba(255,255,255,.09)',
    borderRadius: '13px',
    overflow: 'hidden',
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
            const taskCount = Array.isArray(d.tasks) ? d.tasks.length : 0;
            return (
              <div key={d.id} style={cardStyle}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '10%',
                    bottom: '10%',
                    width: '4px',
                    borderRadius: '0 3px 3px 0',
                    background: d.color,
                    boxShadow: '0 0 12px ' + d.color + '77',
                  }}
                />
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.name}
                  </div>
                  <div style={{ marginTop: '5px', fontSize: '12px', color: 'rgba(231,233,238,.5)', fontFamily: "'JetBrains Mono',monospace" }}>
                    {taskCount} task{taskCount === 1 ? '' : 's'} · deleted {formatDeletedAt(d.deletedAt)}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 'none' }}>
                  <button type="button" style={actionBtn('#2dd4bf')} onClick={() => onRestore(d.id)}>
                    Restore
                  </button>
                  <button type="button" style={actionBtn('#ff7a95')} onClick={() => onPurge(d.id)} title="Delete permanently">
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
