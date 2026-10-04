import React from 'react';
import { hexToRgba } from '../lib/color.js';
import { durLabel } from '../lib/time.js';
import RichTitle from './RichTitle.jsx';

// Confirmation shown before deleting a track that still has unfinished work:
// open tasks on the board and/or pending backlog entries. Cancel is focused by
// default (Enter/Esc never delete by accident); only "Delete track" deletes.

const mono = "'JetBrains Mono',ui-monospace,monospace";
const MAX_ROWS = 5;

function TaskList({ label, items, timeFormat, color, fmtWhen }) {
  if (!items.length) return null;
  const shown = items.slice(0, MAX_ROWS);
  const more = items.length - shown.length;
  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(231,233,238,.55)', fontFamily: mono }}>
          {label}
        </span>
        <span style={{ fontSize: '11px', color: 'rgba(231,233,238,.4)', fontFamily: mono }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {shown.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '7px 10px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,.035)',
              border: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <span style={{ flex: 'none', width: '3px', height: '14px', borderRadius: '2px', background: hexToRgba(color, 0.9) }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: '13px', color: '#e7e9ee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <RichTitle text={t.title || 'Untitled task'} />
            </span>
            <span style={{ flex: 'none', fontFamily: mono, fontSize: '10.5px', color: 'rgba(231,233,238,.5)' }}>
              {fmtWhen(t)} · {durLabel(t.duration || 0)}
            </span>
          </div>
        ))}
        {more > 0 && (
          <div style={{ padding: '2px 10px', fontFamily: mono, fontSize: '11px', color: 'rgba(231,233,238,.45)' }}>+ {more} more</div>
        )}
      </div>
    </div>
  );
}

export default function ConfirmDeleteTrack({ trackName, color, boardTasks, backlogTasks, fmtBoardWhen, fmtBacklogWhen, onCancel, onConfirm }) {
  const cancelRef = React.useRef(null);
  React.useEffect(() => {
    cancelRef.current && cancelRef.current.focus();
  }, []);
  const total = boardTasks.length + backlogTasks.length;
  const accent = color || '#94a3b8';

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(4,6,10,.62)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'confirmFadeIn .14s ease-out',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-del-title"
        aria-describedby="confirm-del-desc"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        style={{
          width: '440px',
          maxWidth: '100%',
          maxHeight: '86vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
          padding: '20px 20px 18px',
          borderRadius: '14px',
          background: 'linear-gradient(180deg, rgba(20,24,32,.98), rgba(13,16,22,.98))',
          border: '1px solid rgba(255,255,255,.1)',
          boxShadow: '0 24px 60px rgba(0,0,0,.6)',
          color: '#e7e9ee',
          fontFamily: "'Space Grotesk',sans-serif",
          animation: 'confirmPopIn .16s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <span
            style={{
              flex: 'none',
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(251,191,36,.12)',
              border: '1px solid rgba(251,191,36,.35)',
              color: '#fbbf24',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 2.5 20h19z" />
              <line x1="12" y1="10" x2="12" y2="14" />
              <circle cx="12" cy="17" r=".6" fill="currentColor" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="confirm-del-title" style={{ fontSize: '16px', fontWeight: 700, color: '#f5f6fa', lineHeight: 1.3 }}>
              Delete{' '}
              <span style={{ color: accent }}>{trackName || 'this track'}</span>?
            </div>
            <div id="confirm-del-desc" style={{ marginTop: '4px', fontSize: '13px', color: 'rgba(231,233,238,.62)', lineHeight: 1.45 }}>
              {total} task{total === 1 ? ' is' : 's are'} still pending on this track. Do you still want to delete it?
            </div>
          </div>
        </div>

        <TaskList label="On the board" items={boardTasks} color={accent} fmtWhen={fmtBoardWhen} />
        <TaskList label="In backlog" items={backlogTasks} color={accent} fmtWhen={fmtBacklogWhen} />

        <div style={{ marginTop: '14px', fontSize: '11.5px', color: 'rgba(231,233,238,.45)', lineHeight: 1.45 }}>
          You can bring the track back later from Menu → Deleted tracks.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <button ref={cancelRef} type="button" className="confirm-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="confirm-btn is-danger" onClick={onConfirm}>
            Delete track
          </button>
        </div>
      </div>
    </div>
  );
}
