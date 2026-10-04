import React from 'react';
import { durLabel } from '../lib/time.js';
import { MarkdownView } from './MarkdownNotes.jsx';
import RichTitle from './RichTitle.jsx';

// Right-docked per-track backlog panel (same shell as DetailPanel).
//
// Opened from the tray button next to a track name. Tabs switch between tracks;
// each row pulls that entry back onto the board. Pulled tasks land at the
// track's "cursor" (now's next slot, then end-to-end after whatever is already
// chained there), so repeated clicks line up left to right. Hovering a row asks
// the board to draw a dashed ghost where it will land.

const MONO = "'JetBrains Mono',ui-monospace,monospace";

// Docked right and resizable from its inner edge — the same width every side
// panel shares (task notes, backlog, to-do).
const panelStyleBase = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 30,
  background: 'linear-gradient(180deg, rgba(16,22,32,.94), rgba(11,15,22,.94))',
  backdropFilter: 'blur(16px) saturate(120%)',
  WebkitBackdropFilter: 'blur(16px) saturate(120%)',
  borderLeft: '1px solid rgba(120,200,220,.22)',
  boxShadow: '-18px 0 46px rgba(0,0,0,.5)',
  animation: 'panelSlideIn .22s ease-out',
};

const resizeHandleStyle = {
  position: 'absolute',
  top: 0,
  left: '-3px',
  bottom: 0,
  width: '8px',
  cursor: 'col-resize',
  zIndex: 31,
  background:
    'linear-gradient(90deg, transparent 0, transparent 2px, rgba(120,200,220,.28) 2px, rgba(120,200,220,.28) 4px, transparent 4px)',
};

const TrayIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 13h5l1.5 2.5h5L16 13h5" />
    <path d="M5.5 5h13l2.5 8v6H3v-6z" />
  </svg>
);

function agoLabel(ms) {
  if (typeof ms !== 'number') return '';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return min + 'm ago';
  const h = Math.round(min / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : d + 'd ago';
}

const NotesIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 3h11l5 5v13H4z" />
    <path d="M14 3v5h5" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const hasNotes = (b) => typeof b.notes === 'string' && b.notes.trim().length > 0;

export default function BacklogPanel({ tracks, activeTrackId, entries, nextHint, width = 400, resizing, onResizeDown, onPickTrack, onPull, onDelete, onHover, onAddAll, onClose, onOpenCompleted }) {
  const active = tracks.find((t) => t.id === activeTrackId);
  const panelStyle = {
    ...panelStyleBase,
    width: Math.round(width) + 'px',
    maxWidth: '92vw',
    transition: resizing ? 'none' : 'width .12s ease',
    ...(resizing ? { userSelect: 'none', WebkitUserSelect: 'none' } : null),
  };
  const handle = (
    <div style={resizeHandleStyle} onMouseDown={onResizeDown} title="Drag to resize" aria-label="Resize panel" role="separator" />
  );
  // Entry whose Markdown notes are open inside the panel (null = list view).
  const [notesId, setNotesId] = React.useState(null);
  const notesEntry = notesId ? entries.find((b) => b.id === notesId) : null;
  React.useEffect(() => setNotesId(null), [activeTrackId]);

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 16px 12px 18px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
      <TrayIcon color="#67e8f9" />
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#f0f2f6', flex: 1 }}>Backlog</div>
      {onOpenCompleted && (
        <button type="button" className="backlog-completed-link" onClick={onOpenCompleted} title="View completed tasks">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <polyline points="8 12.5 11 15.5 16.5 9" />
          </svg>
          Completed
        </button>
      )}
      <button type="button" className="backlog-close" onClick={onClose} aria-label="Close backlog" title="Close (Esc)">
        ×
      </button>
    </div>
  );

  // ── Notes view: one entry's Markdown, with add / delete right there ──
  if (notesEntry) {
    return (
      <div style={panelStyle} data-task-panel="true" data-no-drag="true" onMouseDown={(e) => e.stopPropagation()}>
        {handle}
        {header}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 16px 12px 12px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          <button type="button" className="backlog-icon-btn" onClick={() => setNotesId(null)} aria-label="Back to backlog list" title="Back">
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#f0f2f6', lineHeight: 1.3, overflowWrap: 'break-word' }}><RichTitle text={notesEntry.title} /></div>
            <div style={{ marginTop: '4px', fontFamily: MONO, fontSize: '10.5px', color: 'rgba(231,233,238,.45)' }}>
              {durLabel(notesEntry.duration)} · pushed {agoLabel(notesEntry.backloggedAt)}
            </div>
          </div>
        </div>
        <div className="backlog-notes" style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 16px' }}>
          <MarkdownView value={notesEntry.notes} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <button
            type="button"
            className="backlog-delete-text"
            onClick={() => {
              setNotesId(null);
              onDelete(notesEntry.id);
            }}
          >
            <TrashIcon /> Delete
          </button>
          <button
            type="button"
            onClick={() => {
              setNotesId(null);
              onPull(notesEntry.id);
            }}
            style={{ border: 0, background: 'transparent', color: '#22d3ee', fontSize: '12.5px', cursor: 'pointer', padding: 0 }}
          >
            Add to board →
          </button>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div style={panelStyle} data-task-panel="true" data-no-drag="true" onMouseDown={(e) => e.stopPropagation()}>
        {handle}
      {header}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '12px 16px 10px' }}>
        {tracks.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'backlog-tab' + (t.id === activeTrackId ? ' is-on' : '')}
            onClick={() => onPickTrack(t.id)}
          >
            <span style={{ width: '3px', height: '12px', borderRadius: '2px', background: t.color }} />
            {t.name}
            <span style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(231,233,238,.45)' }}>{t.count}</span>
          </button>
        ))}
      </div>

      {entries.length === 0 && (
        <div style={{ padding: '18px 20px', fontSize: '12.5px', color: 'rgba(231,233,238,.5)', lineHeight: 1.5 }}>
          Nothing in {active ? active.name : 'this track'}’s backlog. Hover one of its tasks and hit the tray icon to push it here.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 10px', flex: 1, overflowY: 'auto' }} onMouseLeave={() => onHover(null)}>
        {entries.map((b) => (
          <div key={b.id} className="backlog-row" onMouseEnter={() => onHover(b.id)}>
            <button type="button" className="backlog-row-main" onClick={() => onPull(b.id)} title="Add to the board after the last task">
              <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                <span title={b.title} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><RichTitle text={b.title} /></span>
                <span style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(231,233,238,.4)' }}>pushed {agoLabel(b.backloggedAt)}</span>
              </span>
              <span className="backlog-row-add" style={{ fontFamily: MONO }}>add →</span>
              <span style={{ fontFamily: MONO, fontSize: '10px', color: 'rgba(231,233,238,.5)', padding: '2px 6px', borderRadius: '5px', background: 'rgba(231,233,238,.06)' }}>
                {durLabel(b.duration)}
              </span>
            </button>
            {hasNotes(b) && (
              <button
                type="button"
                className="backlog-icon-btn has-notes"
                onClick={() => setNotesId(b.id)}
                aria-label={'View notes for ' + b.title}
                title="View notes"
              >
                <NotesIcon />
              </button>
            )}
            <button
              type="button"
              className="backlog-icon-btn backlog-row-delete"
              onClick={() => onDelete(b.id)}
              aria-label={'Delete ' + b.title + ' from backlog'}
              title="Delete (undo with ⌘Z)"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>

      {entries.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <span style={{ fontFamily: MONO, fontSize: '11px', color: 'rgba(103,232,249,.8)' }} title="Where the next pulled task lands">next · {nextHint}</span>
          <button type="button" onClick={onAddAll} style={{ border: 0, background: 'transparent', color: '#22d3ee', fontSize: '12.5px', cursor: 'pointer', padding: 0 }}>
            Add all
          </button>
        </div>
      )}
    </div>
  );
}

export { TrayIcon };
