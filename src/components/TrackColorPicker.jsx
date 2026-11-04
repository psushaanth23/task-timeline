import React from 'react';
import { createPortal } from 'react-dom';
import { hexToRgba } from '../lib/color.js';

const WIDTH = 192;

// Compact glass "track color" popover: the same swatch grid tracks already use
// (the shared PALETTE) plus a color wheel for a fully custom color. Anchored to
// the track's color dot, rendered through a portal with position:fixed so the
// sidebar/gutter can't clip it; closes on outside-click / Escape. Mirrors
// TagPicker's chrome so the two popovers feel like one family.
export default function TrackColorPicker({ rect, value, palette, onPick, onClose }) {
  const rootRef = React.useRef(null);
  const current = (value || '').toLowerCase();
  const inPalette = palette.some((c) => c.toLowerCase() === current);

  React.useEffect(() => {
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  // Position: below the anchor, clamped inside the viewport; flip above if the
  // anchor sits near the bottom edge.
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8));
  const belowTop = rect.bottom + 6;
  const flipUp = belowTop > window.innerHeight - 150;
  const style = {
    position: 'fixed',
    left: Math.round(left) + 'px',
    [flipUp ? 'bottom' : 'top']: flipUp
      ? Math.round(window.innerHeight - rect.top + 6) + 'px'
      : Math.round(belowTop) + 'px',
    width: WIDTH + 'px',
    background: 'rgba(18,20,28,0.86)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    border: '1px solid rgba(255,255,255,.14)',
    borderRadius: '12px',
    boxShadow: '0 16px 44px rgba(0,0,0,.6), 0 0 18px rgba(120,140,255,.18)',
    padding: '10px',
    zIndex: 10000,
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    animation: 'trackTipIn .16s ease',
  };

  return createPortal(
    <div ref={rootRef} style={style} data-no-drag="true" onMouseDown={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
        {palette.map((c) => {
          const active = c.toLowerCase() === current;
          return (
            <span
              key={c}
              onClick={() => onPick(c)}
              title={c}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: c,
                cursor: 'pointer',
                border: active ? '2px solid #fff' : '2px solid rgba(0,0,0,.3)',
                boxShadow: '0 0 6px ' + hexToRgba(c, 0.5),
              }}
            />
          );
        })}
        {/* Color wheel for a fully custom color — native picker inside a swatch. */}
        <label
          title="Custom color"
          style={{
            position: 'relative',
            width: '20px',
            height: '20px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: inPalette
              ? 'conic-gradient(#f87171,#fbbf24,#4ade80,#38bdf8,#a78bfa,#f87171)'
              : current || '#5eead4',
            border: !inPalette && current ? '2px solid #fff' : '2px solid rgba(0,0,0,.3)',
            boxShadow: !inPalette && current ? '0 0 6px ' + hexToRgba(current, 0.5) : 'none',
          }}
        >
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : '#5eead4'}
            onChange={(e) => onPick(e.target.value)}
            aria-label="Pick a custom track color"
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              width: '100%',
              height: '100%',
              cursor: 'pointer',
              border: 'none',
              padding: 0,
            }}
          />
        </label>
      </div>
    </div>,
    document.body,
  );
}
