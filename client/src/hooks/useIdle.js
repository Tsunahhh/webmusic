import { useEffect, useState } from 'react';

// Anything that means a person is still there. pointermove covers mouse and
// stylus, touchstart covers taps (a tap also fires pointerdown, but not on
// every browser/setting combination), wheel covers scrolling a long library
// without ever moving the cursor.
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'];

// True once `delayMs` has passed with no sign of a person. `enabled` is what
// keeps this from being a general-purpose idle timer: the caller decides when
// idling is even meaningful (see App.jsx — only while something is actually
// playing), and flipping it off resets to "not idle" rather than freezing the
// last value.
//
// setIdle(false) fires on every pointermove, which sounds expensive but isn't:
// React bails out of a re-render when the state is already false, so the only
// per-event work is re-arming one timeout.
export function useIdle(delayMs, enabled) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIdle(false);
      return;
    }

    let timer = null;
    function arm() {
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), delayMs);
    }
    function onActivity() {
      setIdle(false);
      arm();
    }

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, onActivity, { passive: true });
    }
    arm();

    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, onActivity);
    };
  }, [delayMs, enabled]);

  return idle;
}
