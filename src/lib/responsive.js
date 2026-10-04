import React from 'react';

// Phone-width detection, shared by the pages and panels that reflow. 640px
// catches phones in both orientations and leaves tablets on the wide layout.
export const NARROW_MQ = '(max-width: 640px)';

const mql = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_MQ) : null;

export function isNarrowNow() {
  const q = mql();
  return q ? q.matches : false;
}

// Subscribe to width changes; returns an unsubscribe. addEventListener is the
// modern API, addListener the fallback for older Safari.
export function onNarrowChange(fn) {
  const q = mql();
  if (!q) return () => {};
  const handler = () => fn(q.matches);
  if (q.addEventListener) q.addEventListener('change', handler);
  else q.addListener(handler);
  return () => {
    if (q.removeEventListener) q.removeEventListener('change', handler);
    else q.removeListener(handler);
  };
}

// Hook flavour for the function components.
export function useIsNarrow() {
  const [narrow, setNarrow] = React.useState(isNarrowNow);
  React.useEffect(() => onNarrowChange(setNarrow), []);
  return narrow;
}

// True on touch-first devices (phones, tablets). Used to widen hit areas that
// are comfortable with a mouse but not with a fingertip.
export function isCoarsePointer() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
  } catch (e) {
    return false;
  }
}
