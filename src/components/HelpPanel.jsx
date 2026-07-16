import React from 'react';
import { createPortal } from 'react-dom';

// "How to use" panel: a dark-glass modal listing every gesture/shortcut,
// grouped into labeled sections with the key/gesture on the left (kbd-style
// chip) and its description on the right. Closes on Escape, backdrop click, or
// the X. Rendered via portal so it overlays cleanly above the app.
const SECTIONS = [
  {
    title: 'Tasks',
    rows: [
      ['Double-click empty', 'New task (opens inline rename)'],
      ['Double-click task', 'Edit / rename'],
      ['Triple-click task', 'Mark done'],
      ['Single click', 'Select'],
      ['Drag', 'Move'],
      ['Drag edges', 'Resize duration'],
      ['Drag on empty timeline', 'Marquee-select'],
      ['Move a selection', 'Selected tasks move together'],
    ],
  },
  {
    title: 'Time',
    rows: [
      ['Snap', 'Start / end snap to 10-min'],
      ['While dragging', 'Live start / end time HUD'],
    ],
  },
  {
    title: 'Keyboard',
    rows: [
      ['Del / Backspace', 'Delete selected'],
      ['⌘Z / Ctrl+Z', 'Undo'],
      ['⌘⇧Z / Ctrl+Shift+Z', 'Redo'],
    ],
  },
  {
    title: 'View',
    rows: [
      ['Density bar', 'Zoom time scale (horizontal)'],
      ['Orientation toggle', 'Switch vertical / horizontal'],
      ['Now', 'Jump to the current time'],
    ],
  },
  {
    title: 'Tracks',
    rows: [
      ['Double-click name', 'Rename'],
      ['Drag the track box', 'Reorder'],
      ['Click the color bar', 'Change color'],
      ['+', 'Add / assign tags'],
      ['Delete', 'Move to Archive (restorable)'],
    ],
  },
  {
    title: 'Navigation',
    rows: [['Archive', 'View & restore deleted tracks']],
  },
];

export default function HelpPanel({ onClose }) {
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 9998,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '60px 20px 20px',
    background: 'rgba(6,8,12,0.55)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    overflowY: 'auto',
  };
  const panelStyle = {
    width: '100%',
    maxWidth: '560px',
    background: 'rgba(16,18,26,0.92)',
    backdropFilter: 'blur(16px) saturate(150%)',
    WebkitBackdropFilter: 'blur(16px) saturate(150%)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '16px',
    boxShadow: '0 24px 70px rgba(0,0,0,.6), 0 0 30px rgba(99,102,241,.14)',
    color: '#e7e9ee',
    fontFamily: "'Space Grotesk',sans-serif",
    overflow: 'hidden',
  };
  const headStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 22px',
    borderBottom: '1px solid rgba(255,255,255,.08)',
  };
  const bodyStyle = {
    padding: '18px 22px 24px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '22px 30px',
  };
  const kbdStyle = {
    flex: 'none',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: '11px',
    fontWeight: 600,
    color: '#a5b4fc',
    background: 'rgba(99,102,241,.14)',
    border: '1px solid rgba(99,102,241,.34)',
    borderRadius: '6px',
    padding: '2px 7px',
    whiteSpace: 'nowrap',
  };
  const closeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '30px',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '8px',
    color: 'rgba(231,233,238,.75)',
    cursor: 'pointer',
    padding: 0,
  };

  return createPortal(
    <div style={overlayStyle} onMouseDown={onClose}>
      <div style={panelStyle} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="How to use">
        <div style={headStyle}>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              fontSize: '15px',
              background: 'linear-gradient(90deg,#e7fbff,#7dd3fc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            How to use
          </span>
          <button type="button" style={closeStyle} onClick={onClose} aria-label="Close" title="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={bodyStyle}>
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.12em',
                  color: '#7dd3fc',
                  marginBottom: '9px',
                }}
              >
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {section.rows.map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                    <span style={kbdStyle}>{key}</span>
                    <span style={{ fontSize: '12.5px', color: 'rgba(231,233,238,.72)', lineHeight: 1.35 }}>
                      {desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
