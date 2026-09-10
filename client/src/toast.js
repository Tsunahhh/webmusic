// Minimal module-level pub/sub so any component can fire a toast without
// prop-drilling a callback through the tree — ToastHost.jsx is the only
// subscriber, mounted once in App.jsx.
let listeners = [];

export function showToast(message) {
  const toast = { id: Math.random().toString(36).slice(2), message };
  for (const fn of listeners) fn(toast);
}

export function onToast(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
