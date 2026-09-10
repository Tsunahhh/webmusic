import { useEffect, useState } from 'react';

// Only appears after a *sustained* WS outage — a normal, brief blip (wifi
// hiccup, laptop waking up) already reconnects silently within a second or
// two via useSocket.js's retry loop, and flashing a banner for every one of
// those would be more distracting than useful. The plain connection dot in
// PlayerBar still reflects live status at a glance either way.
const DELAY_MS = 3000;

export default function ReconnectBanner({ connected }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (connected) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [connected]);

  if (!visible) return null;

  return (
    <div className="reconnect-banner">
      <span className="connection-dot" />
      Connexion perdue — tentative de reconnexion en cours…
    </div>
  );
}
