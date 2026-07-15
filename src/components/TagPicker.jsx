import React from 'react';
import { createPortal } from 'react-dom';
import { hexToRgba } from '../lib/color.js';

const WIDTH = 248;

// Compact glass "tag picker" popover: a type-ahead combobox to filter/toggle
// existing tags, create new ones on the fly (auto color), and recolor a tag via
// a swatch strip (cascades globally). Rendered through a portal with
// position:fixed so the sidebar can't clip it; closes on outside-click/Escape.
export default function TagPicker({
  rect,
  allTags,
  assignedIds,
  palette,
  onToggle,
  onCreate,
  onSetColor,
  onClose,
}) {
  const [query, setQuery] = React.useState('');
  const [focusedTagId, setFocusedTagId] = React.useState(null);
  const rootRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const assigned = new Set(assignedIds);

  React.useEffect(() => {
    const el = inputRef.current;
    if (el) requestAnimationFrame(() => el.focus());
  }, []);

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

  const q = query.trim().toLowerCase();
  const filtered = q ? allTags.filter((t) => t.label.toLowerCase().includes(q)) : allTags;
  const exact = allTags.find((t) => t.label.toLowerCase() === q);
  const canCreate = q.length > 0 && !exact;

  const commitCreate = () => {
    if (!canCreate) return;
    onCreate(query.trim());
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canCreate) commitCreate();
      else if (filtered.length === 1) onToggle(filtered[0].id);
    }
  };

  // Position: below the anchor, clamped inside the viewport; flip above if the
  // anchor is near the bottom.
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8));
  const belowTop = rect.bottom + 6;
  const flipUp = belowTop > window.innerHeight - 260;
  const style = {
    position: 'fixed',
    left: Math.round(left) + 'px',
    [flipUp ? 'bottom' : 'top']: flipUp
      ? Math.round(window.innerHeight - rect.top + 6) + 'px'
      : Math.round(belowTop) + 'px',
    width: WIDTH + 'px',
    maxHeight: '320px',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(18,20,28,0.86)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    border: '1px solid rgba(255,255,255,.14)',
    borderRadius: '12px',
    boxShadow: '0 16px 44px rgba(0,0,0,.6), 0 0 18px rgba(120,140,255,.18)',
    padding: '8px',
    zIndex: 10000,
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    animation: 'trackTipIn .16s ease',
  };

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 9px',
    fontSize: '12.5px',
    color: '#f3f5fa',
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.14)',
    borderRadius: '8px',
    outline: 'none',
    fontFamily: 'inherit',
  };

  const rowStyle = (isAssigned) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 7px',
    borderRadius: '8px',
    cursor: 'pointer',
    background: isAssigned ? 'rgba(255,255,255,.07)' : 'transparent',
  });

  return createPortal(
    <div ref={rootRef} style={style} data-no-drag="true" onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Filter or create a tag…"
        style={inputStyle}
      />
      <div style={{ overflowY: 'auto', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {filtered.map((tag) => {
          const isAssigned = assigned.has(tag.id);
          const isFocused = focusedTagId === tag.id;
          return (
            <div key={tag.id}>
              <div style={rowStyle(isAssigned)} onClick={() => onToggle(tag.id)}>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setFocusedTagId(isFocused ? null : tag.id);
                  }}
                  title="Change color"
                  style={{
                    width: '13px',
                    height: '13px',
                    borderRadius: '4px',
                    flex: 'none',
                    background: tag.color,
                    boxShadow: '0 0 8px ' + hexToRgba(tag.color, 0.6),
                    border: isFocused ? '2px solid #fff' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '12.5px',
                    color: '#e7e9ee',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {tag.label}
                </span>
                {isAssigned && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5eead4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              {isFocused && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '5px 7px 7px 29px' }}>
                  {palette.map((c) => (
                    <span
                      key={c}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetColor(tag.id, c);
                      }}
                      title={c}
                      style={{
                        width: '15px',
                        height: '15px',
                        borderRadius: '5px',
                        background: c,
                        cursor: 'pointer',
                        border: c === tag.color ? '2px solid #fff' : '2px solid rgba(0,0,0,.3)',
                        boxShadow: '0 0 6px ' + hexToRgba(c, 0.5),
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && !canCreate && (
          <div style={{ padding: '8px 7px', fontSize: '12px', color: 'rgba(231,233,238,.45)' }}>
            No tags yet
          </div>
        )}
      </div>
      {canCreate && (
        <div
          onClick={commitCreate}
          style={{
            marginTop: '6px',
            padding: '7px 9px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '12.5px',
            color: '#14b8a6',
            background: 'rgba(20,184,166,.1)',
            border: '1px solid rgba(20,184,166,.4)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Create “{query.trim()}”
        </div>
      )}
    </div>,
    document.body,
  );
}
