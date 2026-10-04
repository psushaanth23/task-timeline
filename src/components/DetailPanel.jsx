import React from 'react';
import MarkdownNotes from './MarkdownNotes.jsx';
import RichTitle from './RichTitle.jsx';
import { useIsNarrow } from '../lib/responsive.js';

const panelStyleBase = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 30,
  background:
    'linear-gradient(180deg, rgba(16,22,32,.94), rgba(11,15,22,.94))',
  backdropFilter: 'blur(16px) saturate(120%)',
  WebkitBackdropFilter: 'blur(16px) saturate(120%)',
  borderLeft: '1px solid rgba(120,200,220,.22)',
  boxShadow: '-18px 0 46px rgba(0,0,0,.5)',
  animation: 'panelSlideIn .22s ease-out',
};

// Draggable resize handle on the panel's inner (left) edge.
const resizeHandleStyle = {
  position: 'absolute',
  top: 0,
  left: '-3px',
  bottom: 0,
  width: '8px',
  cursor: 'col-resize',
  zIndex: 31,
  // Thin accent line centered in the hit area, brightening on hover.
  background:
    'linear-gradient(90deg, transparent 0, transparent 2px, rgba(120,200,220,.28) 2px, rgba(120,200,220,.28) 4px, transparent 4px)',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  padding: '16px 16px 14px',
  borderBottom: '1px solid rgba(255,255,255,.07)',
};

const titleStyle = {
  fontSize: '16px',
  fontWeight: 700,
  color: '#f0f2f6',
  lineHeight: 1.25,
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
};

const metaStyle = {
  marginTop: '5px',
  fontSize: '11.5px',
  color: 'rgba(231,233,238,.5)',
  fontFamily: "'JetBrains Mono',ui-monospace,monospace",
  letterSpacing: '.02em',
};

const closeBtnStyle = {
  flex: 'none',
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: 'rgba(231,233,238,.7)',
  fontSize: '18px',
  lineHeight: 1,
  cursor: 'pointer',
};

const nameInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '16px',
  fontWeight: 700,
  color: '#f0f2f6',
  lineHeight: 1.25,
  background: 'rgba(0,0,0,.35)',
  border: '1px solid rgba(120,200,220,.4)',
  borderRadius: '6px',
  padding: '2px 6px',
  outline: 'none',
};

const doneBtnStyle = (done) => ({
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  height: '28px',
  padding: '0 11px',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 700,
  fontFamily: "'JetBrains Mono',ui-monospace,monospace",
  letterSpacing: '.02em',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  border: done ? '1px solid rgba(74,222,128,.55)' : '1px solid rgba(255,255,255,.16)',
  background: done ? 'rgba(74,222,128,.16)' : 'rgba(255,255,255,.05)',
  color: done ? '#4ade80' : 'rgba(231,233,238,.8)',
});

const bodyStyle = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: '14px 16px 16px',
};

const sectionLabelStyle = {
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '.18em',
  color: 'rgba(120,200,220,.7)',
  fontFamily: "'JetBrains Mono',ui-monospace,monospace",
  marginBottom: '8px',
};

// Right-edge detail drawer for a single task. Slides in over the board (the
// timeline stays visible/usable on the left). Header shows the task name +
// time/duration; body hosts the Markdown notes editor/viewer.
export default function DetailPanel({
  task,
  timeLabel,
  done = false,
  width = 410,
  resizing = false,
  onResizeDown,
  onClose,
  onRename,
  onToggleDone,
  onSendToBacklog,
  onSaveNotes,
  todoSnapshots,
  onToggleTodo,
}) {
  const narrow = useIsNarrow();
  const [editingName, setEditingName] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const nameRef = React.useRef(null);
  const taskId = task && task.id;

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      const typing =
        el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);
      // While editing the name or notes, Escape cancels that edit (handled
      // locally) rather than closing the whole panel.
      if (!typing) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Switching to a different task cancels any in-progress name edit.
  React.useEffect(() => {
    setEditingName(false);
  }, [taskId]);

  React.useEffect(() => {
    if (editingName && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [editingName]);

  if (!task) return null;

  const startNameEdit = () => {
    setDraft(task.title || '');
    setEditingName(true);
  };
  const commitName = () => {
    setEditingName(false);
    const next = (draft || '').trim();
    if (next && next !== task.title) onRename(task.id, next);
  };

  const panelStyle = {
    ...panelStyleBase,
    // Phones: the drawer takes the whole screen — a 410px panel beside a 390px
    // board leaves nothing usable of either.
    width: narrow ? '100%' : Math.round(width) + 'px',
    maxWidth: narrow ? '100%' : '92vw',
    // No width transition while actively dragging so it tracks the cursor 1:1.
    transition: resizing ? 'none' : 'width .12s ease',
    // Suppress text selection during a resize drag.
    ...(resizing ? { userSelect: 'none', WebkitUserSelect: 'none' } : null),
  };

  return (
    <aside className="detail-panel" data-task-panel="true" style={panelStyle} onMouseDown={(e) => e.stopPropagation()}>
      {!narrow && (
        <div
          style={resizeHandleStyle}
          onMouseDown={onResizeDown}
          title="Drag to resize"
          aria-label="Resize panel"
          role="separator"
          aria-orientation="vertical"
        />
      )}
      {(() => {
        // Wide: one row — name, then the actions, then close. Narrow: the name
        // owns the first row (with close), and the actions get a full-width row
        // of their own instead of squeezing the name into a sliver.
        const nameBlock = (
          <div style={{ minWidth: 0, flex: 1 }}>
            {editingName ? (
              <input
                ref={nameRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitName();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingName(false);
                  }
                }}
                aria-label="Task name"
                style={nameInputStyle}
              />
            ) : (
              <div
                style={{ ...titleStyle, cursor: 'text' }}
                title={(task.title || '') + '  (double-click to rename)'}
                onDoubleClick={startNameEdit}
              >
                <RichTitle text={task.title || 'Untitled task'} />
              </div>
            )}
            <div style={metaStyle}>{timeLabel}</div>
          </div>
        );

        const doneButton = (
          <button
            type="button"
            onClick={onToggleDone}
            aria-label={done ? 'Reopen task' : 'Mark task done'}
            title={done ? 'Completed — click to reopen' : 'Mark task as done'}
            style={{
              ...doneBtnStyle(done),
              ...(narrow ? { flex: 1, height: '34px', justifyContent: 'center' } : null),
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {done ? 'Done' : 'Mark done'}
          </button>
        );

        // #96: defer this task off the board into the backlog.
        const backlogButton = onSendToBacklog ? (
          <button
            type="button"
            onClick={onSendToBacklog}
            aria-label="Move task to backlog"
            title="Move to backlog"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              flex: narrow ? 1 : 'none',
              height: narrow ? '34px' : 'auto',
              background: 'rgba(255,183,77,.12)',
              border: '1px solid rgba(255,183,77,.4)',
              color: '#ffb74d',
              borderRadius: '9px',
              padding: narrow ? '0 10px' : '6px 11px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono',monospace",
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              <path d="M3 7l2-4h14l2 4" />
            </svg>
            Backlog
          </button>
        ) : null;

        const closeButton = (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            title="Close (Esc)"
            style={narrow ? { ...closeBtnStyle, width: '34px', height: '34px' } : closeBtnStyle}
          >
            ×
          </button>
        );

        if (!narrow) {
          return (
            <div style={headerStyle}>
              {nameBlock}
              {doneButton}
              {backlogButton}
              {closeButton}
            </div>
          );
        }
        return (
          <div style={{ ...headerStyle, flexDirection: 'column', alignItems: 'stretch', gap: '11px', padding: '14px 13px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              {nameBlock}
              {closeButton}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {doneButton}
              {backlogButton}
            </div>
          </div>
        );
      })()}
      <div style={bodyStyle}>
        <div style={sectionLabelStyle}>NOTES</div>
        <MarkdownNotes
          value={task.notes || ''}
          onSave={onSaveNotes}
          todoSnapshots={task.todoSnapshots}
          onToggleTodo={onToggleTodo}
        />
      </div>
    </aside>
  );
}
