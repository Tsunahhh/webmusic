// Minimal module-level pub/sub so any component can fire a toast without
// prop-drilling a callback through the tree — ToastHost.jsx is the only
// subscriber, mounted once in App.jsx.
let listeners = [];

// options.action = { label, onClick } shows an inline button (e.g. "Annuler")
// that runs onClick and dismisses the toast — used after a destructive
// action so it can be undone within the toast's visible window.
export function showToast(message, options = {}) {
  const toast = { id: Math.random().toString(36).slice(2), message, action: options.action ?? null };
  for (const fn of listeners) fn(toast);
}

export function onToast(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
