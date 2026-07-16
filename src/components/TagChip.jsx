import React from 'react';
import { hexToRgba } from '../lib/color.js';

// The canonical tag chip used under track names. Shared so previews (e.g. the
// Tag Manager) render exactly the same on-track appearance: a tinted pill with
// the tag color as fill + text + border.
export default function TagChip({ label, color, title, onClick }) {
  const clickable = typeof onClick === 'function';
  const style = {
    fontSize: '11px',
    lineHeight: 1.35,
    fontWeight: 600,
    padding: '1px 8px',
    borderRadius: '999px',
    color: color,
    background: hexToRgba(color, 0.16),
    border: '1px solid ' + hexToRgba(color, 0.5),
    maxWidth: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
  if (clickable) {
    // Render as a real button so it's keyboard-accessible; stopPropagation keeps
    // the click from starting a track drag / rename on the surrounding row.
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
        style={{ ...style, cursor: 'pointer', font: 'inherit' }}
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
