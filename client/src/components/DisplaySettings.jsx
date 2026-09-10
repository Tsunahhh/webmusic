import { useEffect } from 'react';
import { DISPLAY_DEFAULTS } from '../hooks/useDisplaySettings.js';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

function Row({ label, hint, children }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <span>{label}</span>
        {hint && <span className="settings-hint">{hint}</span>}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="settings-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// Every control here is a per-device display preference (see
// useDisplaySettings.js) — nothing in this panel touches the shared session,
// so changing anything is safe mid-playback and affects only this screen.
// Changes apply live rather than on a "save": each one is visible in the panel
// itself, which is the only honest way to pick a text size or a tint strength.
export default function DisplaySettings({ open, onClose, settings, onChange, onReset, theme, crossfadeSeconds, onCrossfadeChange }) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <button className="icon-button settings-close" onClick={onClose} title="Fermer">
          ×
        </button>
        <h2>Réglages</h2>

        <h3 className="settings-section">Affichage</h3>

        <Row label="Densité" hint="Hauteur des lignes dans les listes">
          <div className="mode-switch">
            <button
              className={settings.density === 'comfortable' ? 'active' : ''}
              onClick={() => onChange({ density: 'comfortable' })}
            >
              Confortable
            </button>
            <button
              className={settings.density === 'compact' ? 'active' : ''}
              onClick={() => onChange({ density: 'compact' })}
            >
              Compact
            </button>
          </div>
        </Row>

        <Row label="Taille du texte" hint={`${Math.round(settings.fontScale * 100)} %`}>
          <input
            type="range"
            min="0.85"
            max="1.5"
            step="0.05"
            value={settings.fontScale}
            onChange={(e) => onChange({ fontScale: Number(e.target.value) })}
          />
        </Row>

        <Row label="Contraste" hint="Couleurs plus tranchées, fond ambiant désactivé">
          <Toggle
            checked={settings.highContrast}
            onChange={(highContrast) => onChange({ highContrast })}
            label="Contraste élevé"
          />
        </Row>

        <Row label="Animations" hint="En plus du réglage système, que certains OS n’exposent pas">
          <Toggle
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => onChange({ reduceMotion })}
            label="Réduire les animations"
          />
        </Row>

        <Row
          label="Fond ambiant"
          hint={
            theme === 'light'
              ? 'Thème sombre uniquement'
              : settings.highContrast
                ? 'Désactivé par le contraste élevé'
                : `${Math.round(settings.ambientIntensity * 100)} % d’intensité`
          }
        >
          <input
            type="range"
            min="0"
            max="0.8"
            step="0.02"
            value={settings.ambientIntensity}
            disabled={theme === 'light' || settings.highContrast}
            onChange={(e) => onChange({ ambientIntensity: Number(e.target.value) })}
          />
        </Row>

        <Row label="Lumière chaude" hint="Filtre le bleu le soir, comme un mode nuit">
          <Toggle checked={settings.warmLight} onChange={(warmLight) => onChange({ warmLight })} label="Activer" />
        </Row>

        {settings.warmLight && (
          <>
            <Row label="Plage horaire" hint="Peut passer minuit">
              <div className="settings-hours">
                <select value={settings.warmFrom} onChange={(e) => onChange({ warmFrom: Number(e.target.value) })}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
                <span>→</span>
                <select value={settings.warmTo} onChange={(e) => onChange({ warmTo: Number(e.target.value) })}>
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>
            </Row>
            <Row label="Intensité du filtre" hint={`${Math.round(settings.warmStrength * 100)} %`}>
              <input
                type="range"
                min="0.05"
                max="0.7"
                step="0.05"
                value={settings.warmStrength}
                onChange={(e) => onChange({ warmStrength: Number(e.target.value) })}
              />
            </Row>
          </>
        )}

        <h3 className="settings-section">Lecture</h3>
        <p className="settings-shared-note">
          Partagé avec tous les appareils, comme la lecture aléatoire — au contraire des réglages ci-dessus.
        </p>

        <Row
          label="Fondu enchaîné"
          hint={
            crossfadeSeconds === 0
              ? 'Désactivé — coupure nette entre les pistes'
              : `${crossfadeSeconds} s de recouvrement`
          }
        >
          <input
            type="range"
            min="0"
            max="12"
            step="1"
            value={crossfadeSeconds}
            onChange={(e) => onCrossfadeChange(Number(e.target.value))}
          />
        </Row>

        <button
          className="settings-reset"
          onClick={onReset}
          disabled={Object.keys(DISPLAY_DEFAULTS).every((k) => settings[k] === DISPLAY_DEFAULTS[k])}
        >
          Rétablir les réglages par défaut
        </button>
      </div>
    </div>
  );
}
