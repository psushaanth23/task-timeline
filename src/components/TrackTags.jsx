import React from 'react';
import { hexToRgba } from '../lib/color.js';

// Renders a track's assigned tags as small tinted glass chips directly beneath
// the track name, plus a subtle "+" affordance that opens the tag picker. The
// "+" reveals on row hover (see the .track-row / .tag-add rules in index.css)
// so no-tag tracks stay clean. Marked data-no-drag so it never starts a track
// reorder drag or triggers rename.
export default function TrackTags({ tags, onAdd }) {
  const hasTags = tags.length > 0;
  return (
    <div
      data-no-drag="true"
      className={hasTags ? 'tag-row' : 'tag-row tag-row-empty'}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px',
        marginTop: hasTags ? '3px' : 0,
        cursor: 'default',
      }}
    >
      {tags.map((tag) => (
        <span
          key={tag.id}
          title={tag.label}
          style={{
            fontSize: '11px',
            lineHeight: 1.35,
            fontWeight: 600,
            padding: '1px 8px',
            borderRadius: '999px',
            color: tag.color,
            background: hexToRgba(tag.color, 0.16),
            border: '1px solid ' + hexToRgba(tag.color, 0.5),
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {tag.label}
        </span>
      ))}
      <button
        type="button"
        data-no-drag="true"
        className="tag-add"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onAdd}
        title="Add tag"
        aria-label="Add tag"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '17px',
          height: '17px',
          padding: 0,
          borderRadius: '999px',
          border: '1px dashed rgba(255,255,255,.28)',
          background: 'rgba(255,255,255,.04)',
          color: 'rgba(231,233,238,.75)',
          fontSize: '13px',
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        +
      </button>
    </div>
  );
}
