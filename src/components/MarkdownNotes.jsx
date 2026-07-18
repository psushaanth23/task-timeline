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

// Rendered Markdown, shared by the notes viewer and the archive page (#88) so
// both use the exact same pipeline: remark-gfm (GFM tables/checklists),
// rehype-highlight (code syntax highlighting), the safe-by-default component
// overrides, the `.md-body` theme styles, and pasted-image URLs.
//
// #90: when `onToggleTask` is supplied (the LIVE notes preview only) the GFM
// task-list checkboxes render INTERACTIVE — enabled + controlled — and clicking
// one calls onToggleTask(ordinal), where ordinal is the checkbox's position
// among all checkboxes in document order (which matches source task-line order).
// Without it (archive read-only) the checkboxes stay disabled, exactly as before.
export function MarkdownView({ value, onToggleTask }) {
  const interactive = typeof onToggleTask === 'function';
  const components = React.useMemo(() => {
    if (!interactive) return mdComponents;
    return {
      ...mdComponents,
      input: ({ node, ...props }) => {
        if (props.type === 'checkbox') {
          return (
            <input
              type="checkbox"
              className="md-task-checkbox"
              checked={!!props.checked}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const box = e.target;
                const root = box.closest('.md-body');
                const all = root ? Array.from(root.querySelectorAll('input[type="checkbox"]')) : [];
                const idx = all.indexOf(box);
                if (idx >= 0) onToggleTask(idx);
              }}
            />
          );
        }
        return <input {...props} />;
      },
    };
  }, [interactive, onToggleTask]);
  return (
    <div className={interactive ? 'md-body md-interactive' : 'md-body'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

// #90: GFM task-list line matcher — indent, bullet, checkbox, trailing text.
const TASK_LINE_RE = /^(\s*)([-*+])(\s+)\[([ xX])\](\s?)(.*)$/;

const setLineChecked = (line, checked) =>
  line.replace(TASK_LINE_RE, (_full, ind, mk, sp, _box, sp2, rest) =>
    ind + mk + sp + '[' + (checked ? 'x' : ' ') + ']' + sp2 + rest,
  );

// Parse a note's markdown into an ordered list of task-list items with a
// stable-ish identity (indent + ancestor-path + own text) so restore snapshots
// survive reload and small edits. Indentation (leading whitespace, tabs→2sp)
// drives nesting. Items are in source order == the DOM checkbox order.
function parseTaskItems(md) {
  const lines = (md || '').split('\n');
  const items = [];
  const stack = []; // ancestor items: { indent, text }
  lines.forEach((line, idx) => {
    const m = line.match(TASK_LINE_RE);
    if (!m) return;
    const indent = m[1].replace(/\t/g, '  ').length;
    const checked = m[4].toLowerCase() === 'x';
    const text = m[6].trim();
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const key = indent + '::' + stack.map((s) => s.text).concat(text).join(' \u203a ');
    items.push({ idx, indent, depth: Math.floor(indent / 2), checked, text, key });
    stack.push({ indent, text });
  });
  return { lines, items };
}

// #90: toggle the ordinal-th task-list checkbox in a note's markdown, applying
// the cascade (checking a parent checks all deeper descendants) and restore
// (unchecking a parent restores descendants to the snapshot captured right
// before it cascade-checked them). The markdown text is the single source of
// truth for checked state; `snapshots` is an auxiliary map keyed by parent
// identity. Pure + exported for testing. Returns { value, snapshots }.
export function toggleTaskByOrdinal(md, ordinal, snapshots) {
  const snaps = { ...(snapshots || {}) };
  const { lines, items } = parseTaskItems(md);
  if (ordinal < 0 || ordinal >= items.length) return { value: md || '', snapshots: snaps };
  const parent = items[ordinal];
  // Contiguous descendants = subsequent items more deeply indented than parent.
  const descendants = [];
  for (let i = ordinal + 1; i < items.length; i++) {
    if (items[i].indent > parent.indent) descendants.push(items[i]);
    else break;
  }
  const next = lines.slice();
  if (!parent.checked) {
    // Checking: snapshot descendants' current states, then cascade-check all.
    if (descendants.length) {
      snaps[parent.key] = descendants.map((d) => ({ key: d.key, checked: d.checked }));
    }
    next[parent.idx] = setLineChecked(lines[parent.idx], true);
    descendants.forEach((d) => {
      next[d.idx] = setLineChecked(lines[d.idx], true);
    });
  } else {
    // Unchecking: uncheck the parent; restore descendants from the snapshot when
    // it still matches the structure (per-key lookup), else leave them as-is —
    // a graceful fallback that never crashes or corrupts the note.
    next[parent.idx] = setLineChecked(lines[parent.idx], false);
    const snap = snaps[parent.key];
    if (snap && descendants.length) {
      const byKey = new Map(snap.map((s) => [s.key, s.checked]));
      descendants.forEach((d) => {
        if (byKey.has(d.key)) next[d.idx] = setLineChecked(lines[d.idx], byKey.get(d.key));
      });
    }
    delete snaps[parent.key];
  }
  return { value: next.join('\n'), snapshots: snaps };
}

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

// #97: list-line indent regex (bullets `-`/`*`/`+` and, by extension, todos
// `- [ ]`/`- [x]`, which are just a marker + `[ ]` prefix). We only ever touch
// the LEADING whitespace, so the marker/checkbox/text are never disturbed.
const LIST_LINE_RE = /^(\s*)([-*+])(\s+)/;
const leadingSpaces = (line) => (line.match(/^ */) || [''])[0].length;

// Level (in 2-space units) of the nearest preceding NON-EMPTY line above
// `lineStart`, but only if that line is itself a list item. Returns -1 when the
// preceding non-empty line is not a list (or there is none) — meaning the
// current line has no list parent, so it can't be indented (orphan guard).
function precedingListLevel(value, lineStart) {
  let end = lineStart - 1; // index of the '\n' terminating the previous line
  while (end >= 0) {
    const start = value.lastIndexOf('\n', end - 1) + 1;
    const line = value.slice(start, end);
    if (line.trim() !== '') {
      return LIST_LINE_RE.test(line) ? Math.floor(leadingSpaces(line) / 2) : -1;
    }
    end = start - 1;
  }
  return -1;
}

// #97: compute the Tab (indent) / Shift+Tab (outdent) transformation for the
// notes editor. Indentation is 2 spaces per level (matches the #90 todo nesting
// + GFM convention). Operates on the leading whitespace of list lines (plain
// bullets AND todos), so markers/checkboxes/text stay intact. Rules:
//   • single line: indent/outdent that line; a list line's indent is guarded so
//     it can never sit more than one level deeper than the preceding list line
//     (no orphan over-indent). Outdent always allowed down to column 0.
//   • multi-line selection: indent/outdent every LIST line in the selection and
//     keep the selection covering the same lines.
//   • caret/selection shifts by the added/removed spaces so typing continues.
// Pure + exported for testing. Returns { value, selStart, selEnd }.
export function computeIndent(value, selStart, selEnd, outdent) {
  const STEP = 2;
  const lineStartOf = (pos) => value.lastIndexOf('\n', pos - 1) + 1;
  const lineEndOf = (pos) => {
    const nl = value.indexOf('\n', pos);
    return nl === -1 ? value.length : nl;
  };

  const multi = selStart !== selEnd && value.slice(selStart, selEnd).includes('\n');

  if (multi) {
    const firstStart = lineStartOf(selStart);
    // A selection that ends exactly at a line start shouldn't pull in the next line.
    let endRef = selEnd;
    if (selEnd > selStart && value[selEnd - 1] === '\n') endRef = selEnd - 1;
    const lastEnd = lineEndOf(endRef);
    const lines = value.slice(firstStart, lastEnd).split('\n');
    let totalDelta = 0;
    const out = lines.map((ln) => {
      if (!LIST_LINE_RE.test(ln)) return ln; // only list lines (per spec)
      if (outdent) {
        const rm = Math.min(STEP, leadingSpaces(ln));
        totalDelta -= rm;
        return rm > 0 ? ln.slice(rm) : ln;
      }
      totalDelta += STEP;
      return '  ' + ln;
    });
    const newValue = value.slice(0, firstStart) + out.join('\n') + value.slice(lastEnd);
    // Keep the selection over the same lines (start of first .. end of last).
    return { value: newValue, selStart: firstStart, selEnd: lastEnd + totalDelta };
  }

  // Single line (collapsed caret or an in-line range).
  const ls = lineStartOf(selStart);
  const le = lineEndOf(selEnd);
  const line = value.slice(ls, le);
  const isList = LIST_LINE_RE.test(line);
  let delta = 0;
  let newLine = line;
  if (outdent) {
    const rm = Math.min(STEP, leadingSpaces(line));
    if (rm > 0) {
      newLine = line.slice(rm);
      delta = -rm;
    }
  } else {
    let allow = true;
    if (isList) {
      const curLevel = Math.floor(leadingSpaces(line) / STEP);
      const maxLevel = precedingListLevel(value, ls) + 1; // orphan guard
      if (curLevel >= maxLevel) allow = false;
    }
    if (allow) {
      newLine = '  ' + line;
      delta = STEP;
    }
  }
  const newValue = value.slice(0, ls) + newLine + value.slice(le);
  const shift = (n) => Math.max(ls, n + delta);
  return { value: newValue, selStart: shift(selStart), selEnd: shift(selEnd) };
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
export default function MarkdownNotes({ value, onSave, todoSnapshots, onToggleTodo }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value || '');
  const [uploading, setUploading] = React.useState(false);
  const taRef = React.useRef(null);

  // #90: flip the clicked task-list checkbox in the note text (with cascade +
  // restore) and persist. Prefers onToggleTodo (saves text + snapshots); falls
  // back to onSave (text only) if a snapshot sink wasn't provided.
  const handleToggleTask = React.useCallback(
    (ordinal) => {
      const res = toggleTaskByOrdinal(value || '', ordinal, todoSnapshots || {});
      if (res.value === (value || '')) return;
      if (onToggleTodo) onToggleTodo(res.value, res.snapshots);
      else onSave(res.value);
    },
    [value, todoSnapshots, onToggleTodo, onSave],
  );

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
            } else if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
              // #97: Tab indents (sub-point) / Shift+Tab outdents list lines by
              // one 2-space level. Always preventDefault so focus stays in the
              // textarea. Works on bullets and todos; guards against orphan
              // over-indent; handles multi-line selections.
              e.preventDefault();
              const el = e.currentTarget;
              const res = computeIndent(el.value, el.selectionStart, el.selectionEnd, e.shiftKey);
              if (
                res.value !== el.value ||
                res.selStart !== el.selectionStart ||
                res.selEnd !== el.selectionEnd
              ) {
                setDraft(res.value);
                requestAnimationFrame(() => {
                  const ta = taRef.current;
                  if (ta) {
                    ta.focus();
                    ta.setSelectionRange(res.selStart, res.selEnd);
                  }
                });
              }
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
        <MarkdownView value={value} onToggleTask={handleToggleTask} />
      )}
    </div>
  );
}
