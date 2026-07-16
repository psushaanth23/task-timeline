import React from 'react';
import { hexToRgba } from '../lib/color.js';
import TagChip from './TagChip.jsx';

// Tag Manager page (hash route #/tags). Lists every global tag with an inline-
// editable name, a palette swatch color picker, a usage count, and a delete
// action. All edits call back into App (setTagLabel / setTagColor / deleteTag),
// which persists globally and cascades to track chips + the tag picker.
// On-theme dark glass, consistent with ArchivePage.
function TagRow({ tag, usage, palette, onRename, onSetColor, onDelete }) {
  const [name, setName] = React.useState(tag.label);

  React.useEffect(() => {
    setName(tag.label);
  }, [tag.label]);

  const commit = () => {
    const next = name.trim();
    if (next && next !== tag.label) onRename(tag.id, next);
    else setName(tag.label);
  };

  const cardStyle = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '14px 16px 14px 20px',
    marginTop: '12px',
    background: 'rgba(18,20,28,0.62)',
    backdropFilter: 'blur(12px) saturate(150%)',
    WebkitBackdropFilter: 'blur(12px) saturate(150%)',
    border: '1px solid rgba(255,255,255,.09)',
    borderRadius: '13px',
  };
  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,.04)',
    border: '1px solid rgba(255,255,255,.12)',
    borderRadius: '8px',
    color: '#e7e9ee',
    padding: '7px 11px',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: "'Space Grotesk',sans-serif",
    outline: 'none',
  };

  return (
    <div style={cardStyle}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: '12%',
          bottom: '12%',
          width: '4px',
          borderRadius: '0 3px 3px 0',
          background: tag.color,
          boxShadow: '0 0 12px ' + tag.color + '77',
        }}
      />
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') {
              setName(tag.label);
              e.currentTarget.blur();
            }
          }}
          aria-label="Tag name"
          style={inputStyle}
        />
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {palette.map((c) => {
              const active = c.toLowerCase() === (tag.color || '').toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onSetColor(tag.id, c)}
                  title={c}
                  aria-label={'Set color ' + c}
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    padding: 0,
                    border: active ? '2px solid #fff' : '2px solid transparent',
                    boxShadow: active ? '0 0 8px ' + c + 'aa' : 'none',
                  }}
                />
              );
            })}
          </div>
          {/* Live preview of the exact on-track chip; updates as name/color change. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '10px', color: 'rgba(231,233,238,.4)', fontFamily: "'JetBrains Mono',monospace" }}>
              preview
            </span>
            <TagChip label={name.trim() || tag.label} color={tag.color} title="Preview" />
          </div>
        </div>
      </div>
      <div
        style={{
          flex: 'none',
          fontSize: '12px',
          color: 'rgba(231,233,238,.5)',
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: 'nowrap',
        }}
      >
        {usage} track{usage === 1 ? '' : 's'}
      </div>
      <button
        type="button"
        onClick={() => onDelete(tag.id)}
        title="Delete tag"
        aria-label="Delete tag"
        style={{
          flex: 'none',
          background: hexToRgba('#ff7a95', 0.12),
          border: '1px solid ' + hexToRgba('#ff7a95', 0.5),
          color: '#ff7a95',
          borderRadius: '9px',
          padding: '8px 12px',
          fontSize: '12.5px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        Delete
      </button>
    </div>
  );
}

export default function TagManagerPage({ tags, tracks, palette, onRename, onSetColor, onDelete, onBack }) {
  const list = Array.isArray(tags) ? tags : [];
  const usageOf = (tagId) =>
    (tracks || []).filter((tr) => (tr.tagIds || []).includes(tagId)).length;

  const pageStyle = {
    position: 'absolute',
    inset: 0,
    zIndex: 60,
    overflowY: 'auto',
    background:
      'radial-gradient(150% 78% at 50% 132%, rgba(34,102,120,0.22), rgba(14,32,46,0.10) 40%, rgba(9,12,17,0) 62%),' +
      'radial-gradient(1000px 520px at 6% -12%, rgba(99,102,241,0.10), transparent 60%),' +
      'linear-gradient(180deg, #090a0e 0%, #0a0c11 55%, #0b1016 100%)',
    color: '#e7e9ee',
    fontFamily: "'Space Grotesk',sans-serif",
  };
  const innerStyle = { maxWidth: '760px', margin: '0 auto', padding: '30px 26px 60px' };
  const backBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.14)',
    borderRadius: '9px',
    color: 'rgba(231,233,238,.8)',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono',monospace",
  };

  return (
    <div style={pageStyle}>
      <div style={innerStyle}>
        <button type="button" style={backBtnStyle} onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to timeline
        </button>

        <h1
          style={{
            margin: '22px 0 4px',
            fontSize: '24px',
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            background: 'linear-gradient(90deg,#e7fbff,#7dd3fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Tag Manager
        </h1>
        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(231,233,238,.5)', fontFamily: "'JetBrains Mono',monospace" }}>
          {list.length
            ? list.length + ' tag' + (list.length === 1 ? '' : 's') + ' · rename, recolor or delete — changes apply everywhere'
            : 'No tags yet'}
        </p>

        {list.length === 0 ? (
          <div
            style={{
              marginTop: '40px',
              padding: '48px 24px',
              textAlign: 'center',
              border: '1px dashed rgba(255,255,255,.14)',
              borderRadius: '14px',
              background: 'rgba(255,255,255,.02)',
            }}
          >
            <div style={{ fontSize: '34px', opacity: 0.5 }}>🏷️</div>
            <div style={{ marginTop: '10px', fontSize: '15px', fontWeight: 600, color: 'rgba(231,233,238,.75)' }}>
              No tags yet
            </div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: 'rgba(231,233,238,.45)', fontFamily: "'JetBrains Mono',monospace" }}>
              Add tags from a track's “+” button; manage them here.
            </div>
          </div>
        ) : (
          list.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              usage={usageOf(tag.id)}
              palette={palette}
              onRename={onRename}
              onSetColor={onSetColor}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
