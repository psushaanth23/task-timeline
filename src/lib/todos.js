// To-do tree helpers. A to-do is { id, title, notes, parentId, done, taskId }.
// Order is the array order; nesting comes from parentId, capped at MAX_DEPTH.
export const MAX_TODO_DEPTH = 5;
export const TODO_MINUTES = 30;

export function genTodoId() {
  return 'td' + Date.now().toString(36) + Math.floor(Math.random() * 9999).toString(36);
}

export function hydrateTodos(raw) {
  if (!Array.isArray(raw)) return [];
  const byId = new Set(raw.filter((t) => t && t.id).map((t) => t.id));
  return raw
    .filter((t) => t && t.id)
    .map((t) => ({
      id: t.id,
      title: typeof t.title === 'string' && t.title.trim() ? t.title : 'Untitled task',
      notes: typeof t.notes === 'string' ? t.notes : '',
      // Drop parents that no longer exist so nothing goes invisible.
      parentId: t.parentId && byId.has(t.parentId) && t.parentId !== t.id ? t.parentId : null,
      done: !!t.done,
      taskId: t.taskId || null,
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
      // Soft-delete timestamp. Present ⇒ the to-do is in the Deleted bin and
      // hidden from the live list; absent/null ⇒ live. Kept so a reload doesn't
      // resurrect a deleted to-do.
      deletedAt: typeof t.deletedAt === 'number' ? t.deletedAt : null,
    }));
}

export const childrenOf = (todos, id) => todos.filter((t) => t.parentId === id);

export function depthOf(todos, todo) {
  let d = 0;
  let cur = todo;
  while (cur && cur.parentId) {
    cur = todos.find((t) => t.id === cur.parentId);
    d += 1;
    if (d > 20) break; // cycle guard
  }
  return d;
}

// A todo plus every descendant, in list order.
export function subtreeIds(todos, id) {
  const out = [id];
  let grew = true;
  while (grew) {
    grew = false;
    todos.forEach((t) => {
      if (t.parentId && out.includes(t.parentId) && !out.includes(t.id)) {
        out.push(t.id);
        grew = true;
      }
    });
  }
  return out;
}

// Flatten to render order: roots in list order, each followed by its subtree.
export function flattenTodos(todos) {
  const out = [];
  const walk = (parentId, depth) => {
    todos
      .filter((t) => (t.parentId || null) === parentId)
      .forEach((t) => {
        out.push({ todo: t, depth });
        walk(t.id, depth + 1);
      });
  };
  walk(null, 0);
  return out;
}
