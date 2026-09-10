// True when the focused element is a text input / textarea / contenteditable
// — global keyboard shortcuts should stay quiet while the user is typing
// there (search boxes, the new-playlist field, etc).
export function isTypingTarget() {
  const el = document.activeElement;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(el?.isContentEditable);
}
