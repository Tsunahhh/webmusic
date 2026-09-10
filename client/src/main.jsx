import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service workers need a secure context. Over the LAN this app is plain
// http://192.168.x.x, so registration simply doesn't happen there and the app
// behaves exactly as before, minus the offline shell — it does take effect on
// localhost (which counts as secure) or behind an HTTPS reverse proxy. The
// manifest is independent of this: iOS's "Ajouter à l'écran d'accueil" reads
// it over plain http and gets the right name and icon either way.
//
// Dev is excluded on purpose: a cached shell would keep serving stale modules
// over Vite's hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
