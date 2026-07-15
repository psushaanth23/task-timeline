import React from 'react';

export default function SelectionBox({ rect }) {
  if (!rect) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        background: 'rgba(34,211,238,.12)',
        border: '1px solid rgba(34,211,238,.7)',
        borderRadius: '4px',
        pointerEvents: 'none',
        zIndex: 7,
      }}
    />
  );
}
