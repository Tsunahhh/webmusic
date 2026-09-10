import { useEffect, useState } from 'react';
import { onToast } from '../toast.js';

// Actionable toasts (carrying an "Annuler" button) stay up longer than plain
// ones — enough time to actually notice and click it, not just register that
// something happened.
const PLAIN_DURATION = 2500;
const ACTION_DURATION = 6000;

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(
    () =>
      onToast((toast) => {
        const duration = toast.action ? ACTION_DURATION : PLAIN_DURATION;
        const entry = { ...toast, duration };
        setToasts((prev) => [...prev, entry]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== entry.id));
        }, duration);
      }),
    []
  );

  function dismiss(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ animationDuration: `${t.duration}ms` }}>
          <span>{t.message}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
