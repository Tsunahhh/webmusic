import { getLanguage } from './i18n.js';

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

// Locale-aware "5 minutes ago" / "yesterday" for the listening-history rows.
// numeric: 'auto' is what turns -1 day into "yesterday" instead of "1 day
// ago". The locale follows the UI language rather than the browser's own —
// an English UI with French timestamps (or the reverse) reads as a bug, and
// the language is a deliberate choice the user made in the settings panel.
// Formatters are cached per language because constructing one is the
// expensive part and a history list calls this once per row.
const formatters = new Map();

function relative() {
  const lang = getLanguage();
  if (!formatters.has(lang)) formatters.set(lang, new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }));
  return formatters.get(lang);
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  // Negative = in the past, which is the only case here; RelativeTimeFormat
  // wants the sign to carry that.
  const seconds = (timestamp - Date.now()) / 1000;
  const abs = Math.abs(seconds);

  if (abs < MINUTE) return relative().format(Math.round(seconds), 'second');
  if (abs < HOUR) return relative().format(Math.round(seconds / MINUTE), 'minute');
  if (abs < DAY) return relative().format(Math.round(seconds / HOUR), 'hour');
  if (abs < 7 * DAY) return relative().format(Math.round(seconds / DAY), 'day');
  if (abs < 30 * DAY) return relative().format(Math.round(seconds / (7 * DAY)), 'week');
  return relative().format(Math.round(seconds / (30 * DAY)), 'month');
}
