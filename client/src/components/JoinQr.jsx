import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';
import { showToast } from '../toast.js';

// Quiet zone required around a QR symbol for a scanner to lock onto it — 4
// modules is the spec minimum, and skipping it is the usual reason a code
// that "looks fine" won't scan.
const QUIET_ZONE = 4;

// 'M' recovers ~15% damage. Plenty for a code being read off a screen rather
// than a crumpled sticker, and it keeps the symbol small enough to stay
// chunky (= easy to scan from across a room) at this size.
const ERROR_CORRECTION = 'M';

// One <path> for the whole symbol instead of a <rect> per module: a version-3
// code is ~840 modules, and that many DOM nodes is a lot of layout work for
// something that never animates.
function modulePath(qr) {
  const count = qr.getModuleCount();
  let d = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    }
  }
  return d;
}

// navigator.clipboard only exists in a secure context — which this app never
// is, since joining over the LAN means plain http://192.168.x.x. The
// execCommand path is deprecated but it's the only one that works here, and
// the whole point of this panel is the http-LAN case.
async function copyUrl(url) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      showToast('Adresse copiée');
      return;
    }
    const field = document.createElement('textarea');
    field.value = url;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    showToast(ok ? 'Adresse copiée' : 'Copie impossible — sélectionnez l’adresse à la main');
  } catch {
    showToast('Copie impossible — sélectionnez l’adresse à la main');
  }
}

// Shows the LAN address of the server as a scannable code, so a guest joins
// by pointing a camera at the screen instead of having an IP read out to them
// across a room. Display-only: it just renders GET /api/network and changes
// no shared state.
export default function JoinQr({ open, onClose }) {
  const [addresses, setAddresses] = useState(null); // null = still loading
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open) return;
    setAddresses(null);
    setSelected(0);
    fetch('/api/network')
      .then((res) => res.json())
      .then((data) => setAddresses(data.addresses ?? []))
      .catch(() => setAddresses([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const current = addresses?.[selected];
  let qr = null;
  if (current) {
    qr = qrcode(0, ERROR_CORRECTION); // 0 = pick the smallest version that fits
    qr.addData(current.url);
    qr.make();
  }
  const span = qr ? qr.getModuleCount() + QUIET_ZONE * 2 : 0;

  return (
    <div className="join-overlay" onClick={onClose}>
      <div className="join-panel" onClick={(e) => e.stopPropagation()}>
        <button className="icon-button join-close" onClick={onClose} title="Fermer">
          ×
        </button>
        <h2>Connecter un appareil</h2>

        {addresses === null && <p className="empty-hint">Recherche de l’adresse…</p>}

        {addresses?.length === 0 && (
          <p className="empty-hint">
            Aucune adresse réseau trouvée — cette machine n’est peut-être connectée à aucun réseau local.
          </p>
        )}

        {qr && (
          <>
            {/* Always dark-on-light, in both themes: scanners expect that
                polarity and many phone cameras simply fail on an inverted
                code, so this one square deliberately ignores the theme. */}
            <svg className="join-qr" viewBox={`0 0 ${span} ${span}`} role="img" aria-label={`Code QR pour ${current.url}`}>
              <rect width={span} height={span} fill="#ffffff" />
              <path d={modulePath(qr)} transform={`translate(${QUIET_ZONE} ${QUIET_ZONE})`} fill="#000000" />
            </svg>

            <p className="join-hint">Scannez ce code, ou saisissez l’adresse :</p>
            <div className="join-url-row">
              <code className="join-url">{current.url}</code>
              <button className="join-copy" onClick={() => copyUrl(current.url)}>
                Copier
              </button>
            </div>

            {addresses.length > 1 && (
              <div className="join-interfaces">
                {addresses.map((a, i) => (
                  <button
                    key={a.url}
                    className={i === selected ? 'active' : ''}
                    onClick={() => setSelected(i)}
                    title={a.url}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
