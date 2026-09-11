import { useEffect } from 'react';
import { DISPLAY_DEFAULTS } from '../hooks/useDisplaySettings.js';
import { LANGUAGES, setLanguage, useLanguage, useT } from '../i18n.js';

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

// Every control here is a per-device preference (the language, see i18n.js,
// and the display settings, see useDisplaySettings.js) except the crossfade
// at the bottom, which is explicitly flagged as shared — nothing else in this
// panel touches the shared session, so changing it is safe mid-playback and
// affects only this screen. Changes apply live rather than on a "save": each
// one is visible in the panel itself, which is the only honest way to pick a
// language, a text size or a tint strength.
//
// Opened from the gear pinned to the top-right of the app (see App.jsx).
export default function DisplaySettings({ open, onClose, settings, onChange, onReset, theme, crossfadeSeconds, onCrossfadeChange }) {
  const t = useT();
  const language = useLanguage();

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
        <button className="icon-button settings-close" onClick={onClose} title={t('common.close')}>
          ×
        </button>
        <h2>{t('settings.title')}</h2>

        <h3 className="settings-section">{t('settings.sectionGeneral')}</h3>

        {/* Each option is written in its own language, never translated into
            the current one — landing in a language you can't read is exactly
            when this control has to stay usable. */}
        <Row label={t('settings.language')} hint={t('settings.languageHint')}>
          <select
            className="settings-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Row>

        <h3 className="settings-section">{t('settings.sectionDisplay')}</h3>

        <Row label={t('settings.density')} hint={t('settings.densityHint')}>
          <div className="mode-switch">
            <button
              className={settings.density === 'comfortable' ? 'active' : ''}
              onClick={() => onChange({ density: 'comfortable' })}
            >
              {t('settings.densityComfortable')}
            </button>
            <button
              className={settings.density === 'compact' ? 'active' : ''}
              onClick={() => onChange({ density: 'compact' })}
            >
              {t('settings.densityCompact')}
            </button>
          </div>
        </Row>

        <Row
          label={t('settings.textSize')}
          hint={t('settings.percent', { percent: Math.round(settings.fontScale * 100) })}
        >
          <input
            type="range"
            min="0.85"
            max="1.5"
            step="0.05"
            value={settings.fontScale}
            onChange={(e) => onChange({ fontScale: Number(e.target.value) })}
          />
        </Row>

        <Row label={t('settings.contrast')} hint={t('settings.contrastHint')}>
          <Toggle
            checked={settings.highContrast}
            onChange={(highContrast) => onChange({ highContrast })}
            label={t('settings.contrastToggle')}
          />
        </Row>

        <Row label={t('settings.animations')} hint={t('settings.animationsHint')}>
          <Toggle
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => onChange({ reduceMotion })}
            label={t('settings.animationsToggle')}
          />
        </Row>

        <Row
          label={t('settings.ambient')}
          hint={
            theme === 'light'
              ? t('settings.ambientDarkOnly')
              : settings.highContrast
                ? t('settings.ambientDisabled')
                : t('settings.ambientIntensity', { percent: Math.round(settings.ambientIntensity * 100) })
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

        <Row label={t('settings.warmLight')} hint={t('settings.warmLightHint')}>
          <Toggle
            checked={settings.warmLight}
            onChange={(warmLight) => onChange({ warmLight })}
            label={t('settings.enable')}
          />
        </Row>

        {settings.warmLight && (
          <>
            <Row label={t('settings.schedule')} hint={t('settings.scheduleHint')}>
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
            <Row
              label={t('settings.filterStrength')}
              hint={t('settings.percent', { percent: Math.round(settings.warmStrength * 100) })}
            >
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

        <h3 className="settings-section">{t('settings.sectionPlayback')}</h3>
        <p className="settings-shared-note">{t('settings.sharedNote')}</p>

        <Row
          label={t('settings.crossfade')}
          hint={
            crossfadeSeconds === 0
              ? t('settings.crossfadeOff')
              : t('settings.crossfadeSeconds', { seconds: crossfadeSeconds })
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
          {t('settings.reset')}
        </button>
      </div>
    </div>
  );
}
