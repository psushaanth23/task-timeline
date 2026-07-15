import React from 'react';
import { createPortal } from 'react-dom';

// An inline-editable track name that guarantees the full name is discoverable
// when truncated:
//   1) a native `title` tooltip on every name (reliable fallback), and
//   2) an on-theme floating glass name-card that appears on hover ONLY when the
//      text actually overflows its ellipsis.
//
// The card is rendered through a portal with position:fixed + pointer-events:
// none, so it can never be clipped by the sidebar/column, never steals pointer
// events, and never disturbs the contentEditable layout (rename, sidebar
// resize/collapse, and the vertical track headers all keep working).
export default function TrackName({ name, style, onRename, onKeyDown }) {
  const ref = React.useRef(null);
  const [tip, setTip] = React.useState(null);

  const showTip = () => {
    const el = ref.current;
    if (!el) return;
    // Don't reveal while the user is editing this name.
    if (document.activeElement === el) return;
    // Only reveal when the text is genuinely overflowing (ellipsis'd).
    if (el.scrollWidth <= el.clientWidth + 1) return;
    const r = el.getBoundingClientRect();
    const CARD_MAX = 320;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - CARD_MAX - 8));
    setTip({ left: Math.round(left), top: Math.round(r.bottom + 6), text: el.innerText });
  };
  const hideTip = () => setTip(null);

  return (
    <>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        title={name}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={hideTip}
        onBlur={(e) => {
          hideTip();
          onRename(e);
        }}
        onKeyDown={onKeyDown}
        style={style}
      >
        {name}
      </div>
      {tip &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: tip.left + 'px',
              top: tip.top + 'px',
              maxWidth: '320px',
              padding: '5px 11px',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: "'JetBrains Mono',monospace",
              letterSpacing: '.02em',
              color: '#f3f5fa',
              background: 'rgba(18,20,28,0.72)',
              backdropFilter: 'blur(12px) saturate(160%)',
              WebkitBackdropFilter: 'blur(12px) saturate(160%)',
              border: '1px solid rgba(255,255,255,.16)',
              borderRadius: '9px',
              boxShadow: '0 8px 26px rgba(0,0,0,.55), 0 0 14px rgba(120,140,255,.22)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              pointerEvents: 'none',
              zIndex: 9999,
              animation: 'trackTipIn .16s ease',
            }}
          >
            {tip.text}
          </div>,
          document.body,
        )}
    </>
  );
}
