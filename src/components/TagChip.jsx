import React from 'react';
import { hexToRgba } from '../lib/color.js';

// The canonical tag chip used under track names. Shared so previews (e.g. the
// Tag Manager) render exactly the same on-track appearance: a tinted pill with
// the tag color as fill + text + border.
//
// A clickable chip renders as a real <button> (keyboard-accessible), but must
// stay the SAME small size as the static chip — it explicitly sets its font
// instead of inheriting the (larger) surrounding row font, so sidebar track
// tags read as subtle little corner labels rather than bulky pill buttons.
export default function TagChip({ label, color, title, onClick, size = 'sm' }) {
  const clickable = typeof onClick === 'function';
  const dims = size === 'lg' ? { fontSize: '12.5px', padding: '3px 11px' } : { fontSize: '11px', padding: '1px 8px' };
  const style = {
    display: 'inline-block',
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: dims.fontSize,
    lineHeight: 1.35,
    fontWeight: 600,
    padding: dims.padding,
    margin: 0,
    borderRadius: '999px',
    color: color,
    background: hexToRgba(color, 0.16),
    border: '1px solid ' + hexToRgba(color, 0.5),
    maxWidth: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
  };
  if (clickable) {
    // stopPropagation keeps the click from starting a track drag / rename on the
    // surrounding row.
    return (
      <button
        type="button"
        data-no-drag="true"
        title={title != null ? title : label + ' — view tasks'}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClick(e);
        }}
        style={{ ...style, cursor: 'pointer' }}
      >
        {label}
      </button>
    );
  }
  return (
    <span title={title != null ? title : label} style={style}>
      {label}
    </span>
  );
}
