import React from 'react';
import MarkdownNotes from './MarkdownNotes.jsx';

const panelStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(410px, 92%)',
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
export default function DetailPanel({ task, timeLabel, onClose, onSaveNotes }) {
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      const typing =
        el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);
      // While editing notes, Escape cancels the edit (handled locally) rather
      // than closing the whole panel.
      if (!typing) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!task) return null;

  return (
    <aside className="detail-panel" style={panelStyle} onMouseDown={(e) => e.stopPropagation()}>
      <div style={headerStyle}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={titleStyle} title={task.title}>
            {task.title || 'Untitled task'}
          </div>
          <div style={metaStyle}>{timeLabel}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail panel"
          title="Close (Esc)"
          style={closeBtnStyle}
        >
          ×
        </button>
      </div>
      <div style={bodyStyle}>
        <div style={sectionLabelStyle}>NOTES</div>
        <MarkdownNotes value={task.notes || ''} onSave={onSaveNotes} />
      </div>
    </aside>
  );
}
