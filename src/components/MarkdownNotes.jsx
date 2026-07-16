import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
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

// Rendered Markdown by default; double-click to edit the raw Markdown in a
// textarea. Blur or ⌘/Ctrl+Enter commits (re-renders); Escape cancels. Empty
// notes show a subtle "double-click to add" placeholder.
export default function MarkdownNotes({ value, onSave }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || '');
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

  if (editing) {
    return (
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onMouseDown={(e) => e.stopPropagation()}
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
          }
        }}
        placeholder="Write notes in Markdown…  ⌘/Ctrl+Enter to save · Esc to cancel"
        style={textareaStyle}
      />
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
