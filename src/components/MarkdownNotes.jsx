import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { uploadImage } from '../lib/assets.js';
// highlight.js dark theme (github-dark) — fits the app's dark glass aesthetic.
// rehype-highlight only tokenizes code TEXT (via lowlight/highlight.js); it does
// not enable raw HTML, so the safe-by-default posture is unchanged.
import 'highlight.js/styles/github-dark.css';

// react-markdown is safe-by-default: it does NOT render raw HTML embedded in the
// Markdown (we intentionally do not add rehype-raw), so pasted <script>/<img
// onerror>/etc. is escaped as text — no XSS from arbitrary pasted content. We
// only override the link renderer to force safe new-tab behavior.
const mdComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

// #86: Markdown bullet auto-continue. Given the textarea's value + collapsed
// caret, decide what Enter should do on a bullet line (`-`/`*`):
//   • non-empty bullet  → insert a newline pre-filled with the SAME indent +
//     marker + trailing space, so the list continues at the same nesting level.
//   • empty bullet (just marker + space, no content) → clear the marker and do
//     NOT add a line, so the user exits the list instead of stacking blanks.
// Returns { value, caret } to apply, or null to let the default Enter run
// (normal newline on non-bullet lines). Kept pure + exported for testing.
export function computeBulletContinuation(value, selStart, selEnd) {
  // Only auto-continue on a collapsed caret; a range selection means Enter is
  // replacing text, which should behave normally.
  if (selStart !== selEnd) return null;
  const lineStart = value.lastIndexOf('\n', selStart - 1) + 1;
  const nl = value.indexOf('\n', selStart);
  const lineEnd = nl === -1 ? value.length : nl;
  const line = value.slice(lineStart, lineEnd);
  const m = line.match(/^([ \t]*)([-*])([ \t]+)(.*)$/);
  if (!m) return null;
  const [, indent, marker, spacing, content] = m;
  if (content.trim() === '') {
    // Empty bullet: remove the marker (from line start up to the caret) and add
    // no newline — this exits the list.
    const next = value.slice(0, lineStart) + value.slice(selStart);
    return { value: next, caret: lineStart };
  }
  // Continue the list: new line with the same indent + marker + spacing.
  const prefix = '\n' + indent + marker + spacing;
  const next = value.slice(0, selStart) + prefix + value.slice(selEnd);
  return { value: next, caret: selStart + prefix.length };
}

const textareaStyle = {
  width: '100%',
  flex: 1,
  minHeight: '220px',
  resize: 'none',
  boxSizing: 'border-box',
  padding: '12px 13px',
  borderRadius: '10px',
  border: '1px solid rgba(120,200,220,.28)',
  background: 'rgba(8,12,18,.66)',
  color: '#e7e9ee',
  fontFamily: "'JetBrains Mono',ui-monospace,monospace",
  fontSize: '12.5px',
  lineHeight: 1.6,
  outline: 'none',
};

const viewStyle = {
  flex: 1,
  minHeight: '220px',
  padding: '4px 2px',
  cursor: 'text',
  overflowY: 'auto',
};

const placeholderStyle = {
  color: 'rgba(231,233,238,.4)',
  fontSize: '13px',
  fontStyle: 'italic',
  padding: '18px 4px',
  lineHeight: 1.6,
};

const uploadingStyle = {
  position: 'absolute',
  right: '12px',
  bottom: '10px',
  padding: '3px 9px',
  borderRadius: '999px',
  fontSize: '11px',
  fontFamily: "'JetBrains Mono',ui-monospace,monospace",
  color: '#5eead4',
  background: 'rgba(8,12,18,.9)',
  border: '1px solid rgba(94,234,212,.4)',
  pointerEvents: 'none',
};

// Rendered Markdown by default; double-click to edit the raw Markdown in a
// textarea. Blur or ⌘/Ctrl+Enter commits (re-renders); Escape cancels. Empty
// notes show a subtle "double-click to add" placeholder.
export default function MarkdownNotes({ value, onSave }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || '');
  const [uploading, setUploading] = React.useState(false);
  const taRef = React.useRef(null);

  // Sync in from outside (e.g. panel switched to another task) while not editing.
  React.useEffect(() => {
    if (!editing) setDraft(value || '');
  }, [value, editing]);

  React.useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if ((draft || '') !== (value || '')) onSave(draft);
  };
  const cancel = () => {
    setDraft(value || '');
    setEditing(false);
  };

  // Upload image file(s) and splice `![pasted image](url)` markdown into the
  // textarea at the caret. Reads the live textarea value/selection so it stays
  // correct even after the async upload. Returns true if any image was handled.
  const insertImages = async (fileList, el) => {
    const imgs = Array.from(fileList || []).filter((f) => f && f.type && f.type.startsWith('image/'));
    if (!imgs.length) return false;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const base = el.value;
    setUploading(true);
    const snippets = [];
    for (const f of imgs) {
      try {
        const url = await uploadImage(f);
        snippets.push('![pasted image](' + url + ')');
      } catch (err) {
        /* skip a failed upload; keep going with the rest */
      }
    }
    const insert = snippets.join('\n');
    setUploading(false);
    if (!insert) return true; // images were present but all uploads failed
    const next = base.slice(0, start) + insert + base.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        const pos = start + insert.length;
        ta.setSelectionRange(pos, pos);
      }
    });
    return true;
  };

  const onPaste = (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    let files = cd.files && cd.files.length ? Array.from(cd.files) : [];
    if (!files.length && cd.items) {
      files = Array.from(cd.items)
        .filter((it) => it.kind === 'file' && it.type && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter(Boolean);
    }
    const hasImage = files.some((f) => f.type && f.type.startsWith('image/'));
    if (!hasImage) return; // let normal text paste proceed
    e.preventDefault();
    insertImages(files, e.currentTarget);
  };

  const onDrop = (e) => {
    const dt = e.dataTransfer;
    if (!dt || !dt.files || !dt.files.length) return;
    const files = Array.from(dt.files);
    if (!files.some((f) => f.type && f.type.startsWith('image/'))) return;
    e.preventDefault();
    e.stopPropagation();
    insertImages(files, e.currentTarget);
  };

  const onDragOver = (e) => {
    // Must preventDefault to allow the drop; also stop it reaching the board.
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  if (editing) {
    return (
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onMouseDown={(e) => e.stopPropagation()}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onKeyDown={(e) => {
            // Keep timeline shortcuts (Delete/Backspace/copy/undo) from firing while
            // typing notes; the global handler also ignores TEXTAREA, this is belt +
            // suspenders and lets Escape/⌘Enter act locally.
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.metaKey &&
              !e.ctrlKey &&
              !e.altKey
            ) {
              // Bullet auto-continue (#86). Only intercepts when the caret sits
              // on a bullet line; otherwise falls through to a normal newline
              // (which the controlled onChange applies), so plain typing, text
              // paste and the image paste/drop from #74 are all unaffected.
              const el = e.currentTarget;
              const res = computeBulletContinuation(el.value, el.selectionStart, el.selectionEnd);
              if (res) {
                e.preventDefault();
                setDraft(res.value);
                requestAnimationFrame(() => {
                  const ta = taRef.current;
                  if (ta) {
                    ta.focus();
                    ta.setSelectionRange(res.caret, res.caret);
                  }
                });
              }
            }
          }}
          placeholder="Write notes in Markdown…  paste/drop images · ⌘/Ctrl+Enter to save · Esc to cancel"
          style={textareaStyle}
        />
        {uploading && <div style={uploadingStyle}>uploading image…</div>}
      </div>
    );
  }

  const empty = !(value && value.trim());
  return (
    <div onDoubleClick={() => setEditing(true)} title="Double-click to edit" style={viewStyle}>
      {empty ? (
        <div style={placeholderStyle}>No notes yet — double-click to add Markdown notes.</div>
      ) : (
        <div className="md-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
            components={mdComponents}
          >
            {value}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
