import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Minimal floating menu positioned at click coordinates. Closes on an
// outside click or Escape; each item closes it after firing its action.
// Opened from two triggers now — a row's right-click (desktop) and its
// always-visible "more" button (touch, see TrackRow.jsx) — so a click near
// a screen edge (routine on a narrow phone viewport) is clamped back on
// screen instead of rendering partly off it. `items` entries with
// `header: true` render as a plain non-interactive label (used to group the
// per-playlist "add to playlist" entries) instead of a button.
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y, visible: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY), visible: true });
  }, [x, y]);

  useEffect(() => {
    function handlePointerDown(e) {
      if (!ref.current?.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <ul ref={ref} className="context-menu" style={{ top: pos.y, left: pos.x, visibility: pos.visible ? 'visible' : 'hidden' }}>
      {items.map((item, i) =>
        item.header ? (
          <li key={`h-${i}`} className="context-menu-header">
            {item.label}
          </li>
        ) : (
          <li key={`i-${i}`}>
            <button
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              {item.label}
            </button>
          </li>
        )
      )}
    </ul>
  );
}
