import { useEffect, useState } from 'react';

const STORAGE_KEY = 'musicweb-device-name';

// Per-device, like volume and theme — not part of the shared playback state.
// It's only a label this browser attaches to the commands it sends, so other
// devices' toasts can say who did something (see wsServer.js's 'identify'
// and useSocket.js). Empty is a normal value: it just falls back to the
// anonymous "Un autre appareil" wording everything used before.
export function useDeviceName() {
  const [name, setName] = useState(() => localStorage.getItem(STORAGE_KEY) || '');

  useEffect(() => {
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  }, [name]);

  return [name, setName];
}
