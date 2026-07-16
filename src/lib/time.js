export const pad = (n) => String(n).padStart(2, '0');

export const MS_PER_MIN = 60000;

export function currentMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

// Epoch ms of the most recent local midnight (00:00) for the given date.
// This is the timeline's stable pixel-0 origin, so a task's minute offset maps
// to a real, fixed moment instead of a floating "minutes since today".
export function localMidnightMs(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

// Minutes elapsed from a fixed origin to now. Unlike currentMin() this keeps
// counting past 1440 across midnight (1439 -> 1440 -> 1441 ...) so nothing
// anchored to the same origin shifts when the wall clock rolls over.
export function minutesSince(originMs) {
  return (Date.now() - originMs) / MS_PER_MIN;
}

export function minToInput(m) {
  return pad(Math.floor(m / 60) % 24) + ':' + pad(Math.round(m % 60));
}

export function inputToMin(s) {
  const p = (s || '').split(':').map(Number);
  return (p[0] || 0) * 60 + (p[1] || 0);
}

export function fmt(m, timeFormat = '12h') {
  let h = Math.floor(m / 60) % 24;
  const mm = Math.round(m % 60);
  if (timeFormat === '24h') return pad(h) + ':' + pad(mm);
  const ap = h < 12 ? 'AM' : 'PM';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return hh + ':' + pad(mm) + ' ' + ap;
}

// #91/#95: full time for a minor ruler tick (e.g. "9:10" / "21:20"). Takes total
// minutes-from-midnight and honors the 12/24h setting, but WITHOUT the AM/PM
// period — the adjacent hour label already carries it, and minor ticks stay compact.
export function fmtHM(totalMin, timeFormat = '12h') {
  const h = Math.floor(totalMin / 60) % 24;
  const mm = Math.round(totalMin % 60);
  if (timeFormat === '24h') return pad(h) + ':' + pad(mm);
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return hh + ':' + pad(mm);
}

export function fmtHour(h, timeFormat = '12h') {
  const hr = h % 24;
  if (timeFormat === '24h') return pad(hr) + ':00';
  const ap = hr < 12 ? 'AM' : 'PM';
  let hh = hr % 12;
  if (hh === 0) hh = 12;
  return hh + ' ' + ap;
}

// Human-readable date + time for an absolute epoch (e.g. a completedAt stamp),
// like "Jul 16, 3:44 PM". Returns null for missing/invalid input so callers can
// degrade gracefully. Reuses fmt() for the time-of-day portion.
export function fmtDateTime(ms, timeFormat = '12h') {
  if (ms == null || !isFinite(ms)) return null;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + fmt(d.getHours() * 60 + d.getMinutes(), timeFormat);
}

export function durLabel(d) {
  if (d < 60) return d + 'm';
  const h = d / 60;
  return (Number.isInteger(h) ? h : h.toFixed(1)) + 'h';
}
