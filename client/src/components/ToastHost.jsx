import { useEffect, useState } from 'react';
import { onToast } from '../toast.js';

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(
    () =>
      onToast((toast) => {
        setToasts((prev) => [...prev, toast]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, 2500);
      }),
    []
  );

  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </div>
  );
}
