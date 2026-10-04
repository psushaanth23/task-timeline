// Touch support for the board's drag interactions.
//
// Everything on the board (moving a card, resizing it, wiring a dependency from
// an end dot) is driven by mouse events: onMouseDown on the element, then
// document mousemove/mouseup. A touchscreen fires none of those while a finger
// is moving — the browser only synthesises a click after the finger lifts — so
// on a phone or tablet nothing could be moved at all.
//
// Rather than fork every interaction, this bridges touch to the existing mouse
// path: once a gesture is recognised it dispatches real MouseEvents at the same
// coordinates, so the app's own handlers run unchanged.
//
// The gestures:
//   • card       — LONG PRESS (400ms, finger still). A plain drag across a card
//                  stays a canvas pan, so scrolling the board never picks a task
//                  up by accident.
//   • dot/resize — immediate. These targets exist only to be dragged, and they
//                  are too small to be a useful place to start a pan.
// A tap is left alone, so buttons and the detail panel still work normally.

const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 10;

const CARD_SEL = '.task-card';
const DIRECT_SEL = '[data-dot], .task-resize, .task-card-handle';

function fire(target, type, x, y) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === 'mouseup' ? 0 : 1,
    }),
  );
}

// Installs the bridge. Returns an uninstall function.
export function installTouchDrag(root) {
  if (!root || typeof window === 'undefined') return () => {};
  // Mouse and pen already work; this is only for fingers.
  if (!('ontouchstart' in window)) return () => {};

  let timer = null;
  let startX = 0;
  let startY = 0;
  let target = null; // element the gesture started on
  let active = false; // a synthetic drag is in progress
  let lifted = null; // card element given the "picked up" look
  let swallowClick = false;

  const clearPending = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const unlift = () => {
    if (lifted) lifted.classList.remove('touch-lifted');
    lifted = null;
  };

  const begin = (x, y) => {
    active = true;
    if (target && target.closest) {
      const card = target.closest(CARD_SEL);
      if (card) {
        card.classList.add('touch-lifted');
        lifted = card;
      }
    }
    if (navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch (e) {
        /* vibration is a nicety */
      }
    }
    fire(target, 'mousedown', x, y);
  };

  const onTouchStart = (e) => {
    if (active) return;
    if (e.touches.length !== 1) {
      clearPending();
      return;
    }
    const t = e.touches[0];
    const el = e.target;
    if (!el || !el.closest) return;
    // Never hijack a real control, a text field, or the rename editor.
    if (el.closest('button, input, textarea, a, [contenteditable="true"]')) return;
    const direct = el.closest(DIRECT_SEL);
    const card = el.closest(CARD_SEL);
    if (!direct && !card) return;
    target = direct || card;
    startX = t.clientX;
    startY = t.clientY;
    if (direct) {
      begin(startX, startY);
      e.preventDefault();
      return;
    }
    clearPending();
    timer = setTimeout(() => {
      timer = null;
      begin(startX, startY);
    }, LONG_PRESS_MS);
  };

  const onTouchMove = (e) => {
    const t = e.touches[0];
    if (!t) return;
    if (!active) {
      // Moved before the long press landed: this is a pan, let it scroll.
      if (timer && (Math.abs(t.clientX - startX) > MOVE_CANCEL_PX || Math.abs(t.clientY - startY) > MOVE_CANCEL_PX)) {
        clearPending();
        target = null;
      }
      return;
    }
    // Dragging: keep the page from scrolling under the finger.
    e.preventDefault();
    fire(document, 'mousemove', t.clientX, t.clientY);
  };

  const finish = (x, y) => {
    clearPending();
    if (!active) {
      target = null;
      return;
    }
    fire(document, 'mouseup', x, y);
    active = false;
    target = null;
    unlift();
    // The browser still emits a click for the finger that just dragged; that
    // would open the detail panel on drop.
    swallowClick = true;
    setTimeout(() => {
      swallowClick = false;
    }, 350);
  };

  const onTouchEnd = (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    finish(t ? t.clientX : startX, t ? t.clientY : startY);
  };

  const onClickCapture = (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  };

  root.addEventListener('touchstart', onTouchStart, { passive: false });
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  root.addEventListener('touchend', onTouchEnd);
  root.addEventListener('touchcancel', onTouchEnd);
  root.addEventListener('click', onClickCapture, true);

  return () => {
    clearPending();
    unlift();
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchend', onTouchEnd);
    root.removeEventListener('touchcancel', onTouchEnd);
    root.removeEventListener('click', onClickCapture, true);
  };
}
