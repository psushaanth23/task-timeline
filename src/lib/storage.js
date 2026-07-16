const DATA_KEY = 'timeline-todo-v2';
const VIEW_KEY = 'timeline-todo-view';

export function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.tasks)) return s;
  } catch (e) {
    /* ignore corrupt storage */
  }
  return null;
}

export function saveData(tasks, tracks, origin, tags, deletedTracks, dividers) {
  try {
    localStorage.setItem(
      DATA_KEY,
      JSON.stringify({ tasks, tracks, origin, tags, deletedTracks, dividers }),
    );
  } catch (e) {
    /* ignore quota / privacy-mode errors */
  }
}

export function loadView() {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* ignore */
  }
  return null;
}

export function saveView(v) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch (e) {
    /* ignore */
  }
}
