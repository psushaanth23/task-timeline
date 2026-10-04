import React from 'react';
import { MarkdownView } from './MarkdownNotes.jsx';
import { flattenTodos, childrenOf } from '../lib/todos.js';
import { StitchMark } from './ui.jsx';
import RichTitle from './RichTitle.jsx';

// Right-docked to-do panel (opened from the header's To-do button).
//
// One outline: a level-0 task that has children becomes a GROUP — its name is a
// cyan mono label inside a hairline block, with no checkbox. Everything nested
// under it is an ordinary row; depth shows as indentation only. Notes open
// inline (several at once) at a fixed height and scroll; double-click renders
// ↔ edits them with the same Markdown view the task detail panel uses.

const MONO = "'JetBrains Mono',ui-monospace,monospace";
const EDGE = '1px solid rgba(34,211,238,.3)';

// Same shell as the task detail panel: docked right, user-resizable from its
// inner edge, width shared with every other side panel.
const panelStyleBase = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 30,
  background: '#08090b',
  borderLeft: '1px solid rgba(120,200,220,.22)',
  boxShadow: '-18px 0 46px rgba(0,0,0,.6)',
  animation: 'panelSlideIn .22s ease-out',
};

const resizeHandleStyle = {
  position: 'absolute',
  top: 0,
  left: '-3px',
  bottom: 0,
  width: '8px',
  cursor: 'col-resize',
  zIndex: 31,
  background:
    'linear-gradient(90deg, transparent 0, transparent 2px, rgba(120,200,220,.28) 2px, rgba(120,200,220,.28) 4px, transparent 4px)',
};

function TodoRow({
  node,
  todos,
  isGroupHead,
  grouped,
  tracks,
  state,
  api,
}) {
  const t = node.todo;
  const kids = childrenOf(todos, t.id);
  const isParent = kids.length > 0;
  const onBoardKids = kids.filter((k) => k.taskId).length;
  const count = isGroupHead ? onBoardKids + '/' + kids.length : String(kids.length);
  // A LEVEL-0 root with children is the group head. It can now be assigned to a
  // timeline too (its + picks the track for the WHOLE group and puts the root's
  // own card on the board), so it is schedulable like any other row.
  const isGroupRoot = !t.parentId && isParent;
  const scheduled = !!t.taskId;
  const editingTitle = state.editTitle === t.id;
  const noteOpen = !!state.notes[t.id];
  const noteEditing = state.editNote === t.id;
  const menuOpen = state.menu === t.id;
  const hasNotes = !!(t.notes && t.notes.trim());
  const canAdd = !scheduled && !t.done;
  // The group's assigned track (lane of the root's board task), threaded down
  // from App. When set, a child's + adds straight to this track; long-press
  // still opens the picker to override. null ⇒ fall back to the picker.
  const groupTrackIndex = typeof t.groupTrackIndex === 'number' ? t.groupTrackIndex : null;
  const quickAdd = canAdd && !isGroupRoot && groupTrackIndex != null;
  // Long-press plumbing for the + button: on a quick-add row a press-and-hold
  // opens the full track picker so the group's default track can be overridden.
  const pressTimer = React.useRef(null);
  const longPressed = React.useRef(false);

  return (
    <div style={{ position: 'relative' }}>
      {state.over === t.id && state.drag !== t.id && <div className="todo-dropline" />}
      <div
        className={
          'todo-row' +
          (editingTitle ? ' editing' : '') +
          (state.drag === t.id ? ' dragging' : '') +
          (noteOpen ? ' sel' : '') +
          (isGroupHead ? ' ghead' : '')
        }
        style={{ paddingLeft: 10 + node.depth * 16 + 'px' }}
        draggable={!editingTitle}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          api.setDrag(t.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          api.setOver(t.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          api.drop(t.id);
        }}
        onDragEnd={() => api.setDrag(null)}
        onClick={(e) => {
          if (e.target.closest('.no-fold')) return;
          if (isParent) api.toggleFold(t.id);
        }}
        // Double-click anywhere on the row (not just the text) renames it.
        onDoubleClick={(e) => {
          if (e.target.closest('.no-fold')) return;
          e.stopPropagation();
          api.startRename(t.id);
        }}
      >
        {!isGroupHead && (
          <button
            type="button"
            className={'todo-cbox no-fold' + (t.done ? ' on' : '')}
            aria-label={t.done ? 'Mark not done' : 'Mark done'}
            onClick={(e) => {
              e.stopPropagation();
              api.tick(t.id);
            }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 12 9 17 20 6" />
            </svg>
          </button>
        )}

        {editingTitle ? (
          <textarea
            className="todo-edit no-fold"
            rows={1}
            defaultValue={t.title}
            placeholder="Task name"
            autoFocus
            spellCheck={false}
            // Grows with the text so a long name wraps instead of scrolling out
            // of view in a one-line box.
            ref={(el) => {
              if (!el) return;
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
              if (el !== document.activeElement) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
              }
            }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onBlur={(e) => api.rename(t.id, e.target.value)}
            onKeyDown={(e) => {
              // Keep Enter/Esc inside the editor — Esc otherwise closes the panel.
              e.stopPropagation();
              if (e.key === 'Tab') {
                // Tab nests this task under the row above; Shift+Tab lifts it out.
                e.preventDefault();
                api.indent(t.id, e.shiftKey ? -1 : 1, e.target.value);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                api.renameAndNext(t.id, e.target.value, t.parentId);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                api.rename(t.id, e.target.value);
              }
            }}
          />
        ) : (
          <>
          {/* #link: same stitch mark the board card carries, so the pair reads
              from either side. */}
          {scheduled && <StitchMark title={t.schedLabel ? 'On the board · ' + t.schedLabel : 'On the board'} />}
          <span
            className={'todo-ttl' + (t.done ? ' done' : '') + (isGroupHead ? ' head' : '')}
            onDoubleClick={(e) => {
              e.stopPropagation();
              api.startRename(t.id);
            }}
            title={t.title + ' — double-click to rename'}
          >
            <RichTitle text={t.title} />
          </span>
          </>
        )}

        {isParent && !editingTitle && (
          <span className="todo-count mono" title="Subtasks — click the row to show them">
            {count}
          </span>
        )}

        {!editingTitle && <span style={{ flex: 1, minWidth: 0 }} />}

        {canAdd && !editingTitle && (
          <button
            type="button"
            className={'todo-act add-btn no-fold' + (menuOpen ? ' on' : '')}
            title={
              quickAdd
                ? 'Add to this group’s timeline (hold to pick another)'
                : 'Add to a timeline'
            }
            aria-label={quickAdd ? 'Add to this group’s timeline' : 'Add to a timeline'}
            onPointerDown={(e) => {
              if (!quickAdd) return;
              e.stopPropagation();
              longPressed.current = false;
              pressTimer.current = setTimeout(() => {
                longPressed.current = true;
                api.toggleMenu(t.id);
              }, 450);
            }}
            onPointerUp={() => {
              if (pressTimer.current) {
                clearTimeout(pressTimer.current);
                pressTimer.current = null;
              }
            }}
            onPointerLeave={() => {
              if (pressTimer.current) {
                clearTimeout(pressTimer.current);
                pressTimer.current = null;
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (longPressed.current) {
                // The hold already opened the picker; swallow the trailing click.
                longPressed.current = false;
                return;
              }
              if (quickAdd) api.addToTrack(t.id, groupTrackIndex);
              else api.toggleMenu(t.id);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}

        {hasNotes && !editingTitle && (
          <button
            type="button"
            className="todo-note no-fold"
            title="Notes"
            aria-label="Open notes"
            onClick={(e) => {
              e.stopPropagation();
              api.toggleNote(t.id);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 3h11l5 5v13H4z" />
              <path d="M14 3v5h5" />
              <line x1="8" y1="13" x2="16" y2="13" />
            </svg>
          </button>
        )}

        {scheduled && !editingTitle && <span className="todo-chip mono">{t.schedLabel || 'on board'}</span>}

        {!hasNotes && !editingTitle && (
          <button
            type="button"
            className="todo-act no-fold"
            title="Add notes"
            aria-label="Add notes"
            onClick={(e) => {
              e.stopPropagation();
              api.openEmptyNote(t.id);
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 3h11l5 5v13H4z" />
              <path d="M14 3v5h5" />
            </svg>
          </button>
        )}

        {!editingTitle && (
        <button
          type="button"
          className="todo-act danger no-fold"
          title="Delete to-do"
          aria-label="Delete to-do"
          onClick={(e) => {
            e.stopPropagation();
            api.remove(t.id);
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
        )}
      </div>

      {menuOpen && (
        <div className="todo-menu">
          <div className="mono todo-menu-head">Add to timeline</div>
          {tracks.map((tk) => (
            <React.Fragment key={tk.id}>
              <button type="button" className="todo-mrow" onClick={() => api.addToTrack(t.id, tk.index)}>
                <span style={{ flex: 'none', width: '3px', height: '13px', borderRadius: '2px', background: tk.color }} />
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tk.name}</span>
                <span className="mono" style={{ fontSize: '9.5px', color: 'rgba(231,233,238,.35)' }}>{tk.at}</span>
              </button>
              {/* Mirrors the board's track divider (#75): same teal glowing hairline. */}
              {tk.divAfter && <div className="todo-mdiv" />}
            </React.Fragment>
          ))}
        </div>
      )}

      {noteOpen && (
        <div className="todo-note-blk" style={{ marginLeft: 12 + node.depth * 16 + 'px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="mono" style={{ flex: 1, fontSize: '9.5px', letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(94,234,212,.75)' }}>
              <RichTitle text={t.title} />
            </span>
            <button type="button" className="todo-act" onClick={() => api.closeNote(t.id)}>
              close
            </button>
          </div>
          {noteEditing ? (
            <textarea
              className="todo-md-src"
              defaultValue={t.notes}
              autoFocus
              spellCheck={false}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') e.target.blur();
              }}
              onBlur={(e) => api.saveNotes(t.id, e.target.value)}
            />
          ) : (
            <div onDoubleClick={() => api.editNote(t.id)} title="Double-click to edit">
              {t.notes && t.notes.trim() ? (
                <MarkdownView value={t.notes} />
              ) : (
                <div style={{ fontSize: '12px', color: 'rgba(231,233,238,.35)' }}>Empty — double-click to write.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TodoPanel({ todos, deletedTodos = [], tracks, draftId, onDraftHandled, width = 400, resizing, onResizeDown, onClose, onChange, onAddToTrack }) {
  const [state, setState] = React.useState({
    folded: {},
    notes: {},
    editNote: null,
    editTitle: null,
    menu: null,
    drag: null,
    over: null,
    // Finished to-dos start out of the way; the header's show/hide flips it.
    hideDone: true,
    // The Deleted bin (soft-deleted to-dos) is a separate view, off by default.
    showDeleted: false,
  });
  const patch = (p) => setState((s) => ({ ...s, ...p }));

  // A newly created to-do arrives blank: put the caret straight into it.
  React.useEffect(() => {
    if (!draftId) return;
    patch({ editTitle: draftId });
    onDraftHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // Any click outside an open add-menu closes it.
  React.useEffect(() => {
    if (!state.menu) return undefined;
    const away = (e) => {
      if (e.target.closest && (e.target.closest('.todo-menu') || e.target.closest('.add-btn'))) return;
      patch({ menu: null });
    };
    document.addEventListener('mousedown', away, true);
    return () => document.removeEventListener('mousedown', away, true);
  }, [state.menu]);

  const flat = flattenTodos(todos);
  const hidden = (node) => {
    let p = node.todo.parentId;
    while (p) {
      if (state.folded[p]) return true;
      const parent = todos.find((t) => t.id === p);
      p = parent && parent.parentId;
    }
    return false;
  };
  // "hide" sweeps finished to-dos out of the list so only live work shows;
  // "show" (same button) brings them back. Nothing is deleted either way.
  //
  // A finished PARENT that still has unfinished descendants stays visible even
  // while hiding done — greyed out and struck through — so its live subtasks
  // never lose their heading. Only leaf/fully-done branches get swept away.
  const hasLiveDescendant = (id) =>
    childrenOf(todos, id).some((c) => !c.done || hasLiveDescendant(c.id));
  const sweptDone = (n) => state.hideDone && n.todo.done && !hasLiveDescendant(n.todo.id);
  const doneHidden = state.hideDone ? flat.filter((n) => n.todo.done && !hasLiveDescendant(n.todo.id)).length : 0;
  const visible = flat.filter((n) => !hidden(n) && !sweptDone(n));
  const groupRootIds = new Set(todos.filter((t) => !t.parentId && childrenOf(todos, t.id).length).map((t) => t.id));
  const rootOf = (todo) => {
    let cur = todo;
    while (cur.parentId) cur = todos.find((t) => t.id === cur.parentId) || cur;
    return cur;
  };

  // Deleted bin: one entry per deleted subtree. A deleted row is a bin ENTRY
  // only if its parent wasn't deleted in the same act (parent absent from the
  // bin), so a deleted parent shows once with its children summarised, not as
  // several loose rows. Newest deletion first (App already sorts).
  const deletedIds = new Set(deletedTodos.map((t) => t.id));
  const binEntries = deletedTodos.filter((t) => !t.parentId || !deletedIds.has(t.parentId));
  const childCountOf = (id) => deletedTodos.filter((t) => t.parentId === id).length;
  const deletedAgoLabel = (ms) => {
    const days = Math.floor((Date.now() - ms) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    return days + 'd ago';
  };

  // Schedulable = everything except a level-0 grouping root.
  const leaves = todos.filter((t) => t.parentId || !childrenOf(todos, t.id).length);
  const onBoard = leaves.filter((t) => t.taskId).length;
  const doneCount = leaves.filter((t) => t.done).length;
  const pct = leaves.length ? Math.round((100 * onBoard) / leaves.length) : 0;

  const api = {
    setDrag: (id) => patch({ drag: id, over: id ? state.over : null, menu: null }),
    setOver: (id) => patch({ over: id }),
    drop: (id) => {
      onChange({ type: 'reorder', dragId: state.drag, targetId: id });
      patch({ drag: null, over: null });
    },
    toggleFold: (id) => patch({ folded: { ...state.folded, [id]: !state.folded[id] } }),
    tick: (id) => onChange({ type: 'tick', id }),
    rename: (id, title) => {
      onChange({ type: 'rename', id, title });
      patch({ editTitle: null });
    },
    // Enter: save, then open a fresh sibling right below — Todoist-style.
    indent: (id, dir, title) => onChange({ type: 'indent', id, dir, title }),
    renameAndNext: (id, title, parentId) => {
      patch({ editTitle: null });
      onChange({ type: 'renameNext', id, title, parentId: parentId || null });
    },
    startRename: (id) => patch({ editTitle: id }),
    cancelRename: () => patch({ editTitle: null }),
    toggleNote: (id) => patch({ notes: { ...state.notes, [id]: !state.notes[id] }, menu: null }),
    closeNote: (id) => patch({ notes: { ...state.notes, [id]: false }, editNote: null }),
    openEmptyNote: (id) => patch({ notes: { ...state.notes, [id]: true }, editNote: id, menu: null }),
    editNote: (id) => patch({ editNote: id }),
    saveNotes: (id, notes) => {
      onChange({ type: 'notes', id, notes });
      patch({ editNote: null });
    },
    toggleMenu: (id) => patch({ menu: state.menu === id ? null : id }),
    addToTrack: (id, laneIndex) => {
      onAddToTrack(id, laneIndex);
      patch({ menu: null });
    },
    remove: (id) => onChange({ type: 'remove', id }),
    restore: (id) => onChange({ type: 'restore', id }),
  };

  const panelStyle = {
    ...panelStyleBase,
    width: Math.round(width) + 'px',
    maxWidth: '92vw',
    transition: resizing ? 'none' : 'width .12s ease',
    ...(resizing ? { userSelect: 'none', WebkitUserSelect: 'none' } : null),
  };

  return (
    <div style={panelStyle} data-task-panel="true" data-no-drag="true" onMouseDown={(e) => e.stopPropagation()}>
      <div style={resizeHandleStyle} onMouseDown={onResizeDown} title="Drag to resize" aria-label="Resize panel" role="separator" />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '15px 14px 12px 17px' }}>
        <span style={{ color: '#5eead4', display: 'inline-flex' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 12 9 17 20 6" />
          </svg>
        </span>
        <span className="mono todo-title">To-do</span>
        <button
          type="button"
          className={'todo-act pinned' + (state.hideDone ? ' on' : '')}
          onClick={() => patch({ hideDone: !state.hideDone, menu: null })}
          title={state.hideDone ? 'Show finished to-dos again' : 'Hide finished to-dos'}
          aria-pressed={state.hideDone}
        >
          {state.hideDone ? 'show' : 'hide'}
        </button>
        <button
          type="button"
          className={'todo-act pinned' + (state.showDeleted ? ' on' : '')}
          onClick={() => patch({ showDeleted: !state.showDeleted, menu: null })}
          title={
            state.showDeleted
              ? 'Back to the to-do list'
              : 'Show deleted to-dos — restore them here (auto-cleared 7 days after deletion)'
          }
          aria-pressed={state.showDeleted}
        >
          deleted{binEntries.length ? ' ' + binEntries.length : ''}
        </button>
        <button type="button" className="todo-act pinned" onClick={() => patch({ folded: Object.fromEntries(todos.map((t) => [t.id, true])), notes: {}, menu: null })}>
          fold all
        </button>
        <button type="button" className="todo-act pinned" onClick={onClose} aria-label="Close to-do panel" title="Close (Esc)">
          ✕
        </button>
      </div>

      <div style={{ padding: '0 17px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '7px' }}>
          <span className="mono" style={{ fontSize: '10px', color: 'rgba(231,233,238,.45)' }}>
            {onBoard} of {leaves.length} on the board
          </span>
          <span className="mono" style={{ fontSize: '10px', color: 'rgba(231,233,238,.3)' }}>
            {doneCount} done{state.hideDone && doneHidden ? ' · ' + doneHidden + ' hidden' : ''}
          </span>
        </div>
        <span style={{ display: 'block', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: pct + '%', height: '100%', borderRadius: '2px', background: 'linear-gradient(90deg, rgba(34,211,238,.45), #22d3ee)' }} />
        </span>
      </div>

      {state.showDeleted ? (
        <div style={{ flex: 1, padding: '4px 13px 14px', overflowY: 'auto' }}>
          <div className="mono" style={{ fontSize: '10px', letterSpacing: '.05em', color: 'rgba(231,233,238,.4)', padding: '4px 2px 10px' }}>
            Deleted to-dos · restore any before they’re cleared 7 days after deletion
          </div>
          {binEntries.length === 0 ? (
            <div style={{ padding: '28px 12px', textAlign: 'center', border: '1px dashed rgba(255,255,255,.12)', borderRadius: '11px', color: 'rgba(231,233,238,.4)', fontSize: '12.5px' }}>
              Nothing deleted.
            </div>
          ) : (
            binEntries.map((t) => {
              const kids = childCountOf(t.id);
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '9px',
                    padding: '9px 10px',
                    marginBottom: '7px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,.028)',
                    border: '1px solid rgba(255,255,255,.07)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'rgba(231,233,238,.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <RichTitle text={t.title || 'Untitled task'} />
                    </div>
                    <div className="mono" style={{ marginTop: '3px', fontSize: '10px', color: 'rgba(231,233,238,.4)' }}>
                      deleted {deletedAgoLabel(t.deletedAt)}
                      {kids ? ' · ' + kids + ' subtask' + (kids > 1 ? 's' : '') : ''}
                      {t.notes && t.notes.trim() ? ' · has notes' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="todo-act pinned"
                    onClick={() => api.restore(t.id)}
                    title="Restore this to-do"
                  >
                    restore
                  </button>
                </div>
              );
            })
          )}
        </div>
      ) : (
      <div style={{ flex: 1, padding: '4px 9px 12px', overflowY: 'auto' }}>
        {visible.map((node, i) => {
          const grouped = groupRootIds.has(rootOf(node.todo).id);
          const prev = visible[i - 1];
          const next = visible[i + 1];
          const sameBlock = (a, b) => a && b && rootOf(a.todo).id === rootOf(b.todo).id;
          const first = grouped && !sameBlock(prev, node);
          const last = grouped && !sameBlock(next, node);
          const wrap = grouped
            ? {
                background: '#050608',
                borderLeft: EDGE,
                borderRight: EDGE,
                paddingLeft: '5px',
                paddingRight: '5px',
                ...(first ? { borderTop: EDGE, borderTopLeftRadius: '11px', borderTopRightRadius: '11px', paddingTop: '4px' } : null),
                ...(last ? { borderBottom: EDGE, borderBottomLeftRadius: '11px', borderBottomRightRadius: '11px', paddingBottom: '6px', marginBottom: '11px' } : null),
              }
            : null;
          return (
            <div key={node.todo.id} style={wrap || undefined}>
              <TodoRow
                node={node}
                todos={todos}
                grouped={grouped}
                isGroupHead={grouped && first && !node.todo.parentId}
                tracks={tracks}
                state={state}
                api={api}
              />
            </div>
          );
        })}
        <button type="button" className="todo-quick" onClick={() => onChange({ type: 'add', parentId: null })}>
          +  Add a task…
        </button>
      </div>
      )}
    </div>
  );
}
