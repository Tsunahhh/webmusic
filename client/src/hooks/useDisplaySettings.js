import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

const STORAGE_KEY = 'musicweb-display';

// Per-device display preferences, like volume and theme — never part of the
// shared playback state. Two people watching the same session can want
// completely different text sizes; only what's *playing* is shared.
export const DISPLAY_DEFAULTS = {
  density: 'comfortable', // 'comfortable' | 'compact'
  fontScale: 1, // multiplies the root font size, so every rem-based size follows
  highContrast: false,
  reduceMotion: false,
  ambientIntensity: 0.42, // alpha of the cover-tinted mesh (see useCoverPalette.js)
  warmLight: false,
  warmFrom: 21, // hours, inclusive
  warmTo: 7, // hours, exclusive — may wrap past midnight, see isWithinWindow
  warmStrength: 0.35,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DISPLAY_DEFAULTS;
    // Merged over the defaults rather than used as-is: a settings object
    // written before a preference existed would otherwise leave that key
    // undefined, which reaches the DOM as the string "undefined".
    return { ...DISPLAY_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DISPLAY_DEFAULTS;
  }
}

// Evening schedules normally wrap past midnight (21h → 7h), so "from <= now <
// to" is only correct when the window doesn't cross the day boundary; when it
// does, the test flips to a union of the two ends.
export function isWithinWindow(from, to, date) {
  const hours = date.getHours() + date.getMinutes() / 60;
  if (from === to) return false;
  return from < to ? hours >= from && hours < to : hours >= from || hours < to;
}

export function useDisplaySettings() {
  const [settings, setSettings] = useState(load);

  const update = useCallback((patch) => setSettings((prev) => ({ ...prev, ...patch })), []);
  const reset = useCallback(() => setSettings(DISPLAY_DEFAULTS), []);

  // useLayoutEffect, same reason as useTheme.js: these land on <html> before
  // the first paint, so the app never flashes at the wrong size or contrast.
  useLayoutEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    const root = document.documentElement;
    root.dataset.density = settings.density;
    root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    root.dataset.reduceMotion = settings.reduceMotion ? '1' : '0';
    root.style.setProperty('--font-scale', String(settings.fontScale));
  }, [settings]);

  // Re-evaluated on a timer because the schedule turns on by itself at a wall
  // clock time nobody is going to trigger — a minute is plenty of resolution
  // for an hour-granular window, and the interval only runs while the feature
  // is on.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!settings.warmLight) return;
    const id = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [settings.warmLight]);

  const warmActive = settings.warmLight && isWithinWindow(settings.warmFrom, settings.warmTo, new Date());
  // `tick` is what re-runs the check above; referencing it keeps the linter
  // and the next reader from deleting the state as unused.
  void tick;

  return { settings, update, reset, warmActive };
}
