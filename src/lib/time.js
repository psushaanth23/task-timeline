export const pad = (n) => String(n).padStart(2, '0');

export function currentMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
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

export function fmtHour(h, timeFormat = '12h') {
  const hr = h % 24;
  if (timeFormat === '24h') return pad(hr) + ':00';
  const ap = hr < 12 ? 'AM' : 'PM';
  let hh = hr % 12;
  if (hh === 0) hh = 12;
  return hh + ' ' + ap;
}

export function durLabel(d) {
  if (d < 60) return d + 'm';
  const h = d / 60;
  return (Number.isInteger(h) ? h : h.toFixed(1)) + 'h';
}
