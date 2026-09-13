// myworlds — the page owns the gestures on it.
//
// The world takes a pinch to zoom and a drag to turn. Safari on iOS and iPadOS answers the same
// pinch with a page zoom, and the viewport meta does not stop it: Safari has ignored
// `user-scalable=no` since iOS 10, and `touch-action` governs the scroll of an element, not the
// zoom of the page. The zoom that follows leaves the canvas the same size and the reader
// magnified, which reads as a broken control.
//
// So the page blocks the browser answers it does not want, and blocks nothing else. Every
// listener is non-passive, because a passive listener cannot call preventDefault().
(() => {
  'use strict';

  const on = (type, fn) => document.addEventListener(type, fn, { passive: false });

  // The pinch. Safari raises gesturestart/gesturechange/gestureend for a two-finger pinch or
  // rotate, and the page zoom follows the default. The canvas reads the raw touches itself, so
  // nothing on the page needs these events.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) on(type, (e) => e.preventDefault());

  // Whether the browser may answer the touch that is down. It may when the finger landed on a
  // scroll region or on a control the browser draws itself, and it may not anywhere else, where
  // the only answers left are the pinch zoom and the rubber band of the page. The test runs once
  // per gesture, at touchstart, because it reads computed styles and a touchmove arrives every
  // frame.
  let browsers = false;
  on('touchstart', (e) => {
    // A second finger turns the gesture into a pinch, and no pinch on this page belongs to the
    // browser, whatever the first finger landed on.
    browsers = e.touches.length === 1 && (scrollable(e.target) || nativeControl(e.target));
  });

  // The pinch again, on a browser with no gesture events, and the rubber band. A drag the page
  // owns carries no default; a drag inside a scroller or on a slider keeps every default it has.
  on('touchmove', (e) => {
    if (!browsers && e.cancelable) e.preventDefault();
  });

  // The double tap. Safari zooms to the block under a double tap, and `touch-action:
  // manipulation` in the stylesheet does not stop it everywhere. Two taps within 320 ms belong
  // to the app.
  let lastTap = 0;
  on('touchend', (e) => {
    const now = performance.now();
    if (now - lastTap < 320 && !nativeControl(e.target)) e.preventDefault();
    lastTap = now;
  });

  // Whether the touch sits inside something the reader is meant to scroll. Walks up from the
  // target, because the finger lands on a line of text inside the scroller, not on the scroller.
  function scrollable(node) {
    for (let el = node instanceof Element ? node : null; el && el !== document.body; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) return true;
    }
    return false;
  }

  // A control the browser draws itself: the tap that places the caret in a field, the drag that
  // slides the volume, the tap that opens a menu.
  function nativeControl(node) {
    return node instanceof Element && node.closest('input, textarea, select, [contenteditable]') !== null;
  }
})();
