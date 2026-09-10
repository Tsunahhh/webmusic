export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

// Locale-aware "il y a 5 minutes" / "hier" for the listening-history rows.
// numeric: 'auto' is what turns -1 day into "hier" instead of "il y a 1 jour";
// the app's strings are French throughout, so the locale is fixed rather than
// read from the browser, which would give a French UI with English timestamps.
const RELATIVE = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  // Negative = in the past, which is the only case here; RelativeTimeFormat
  // wants the sign to carry that.
  const seconds = (timestamp - Date.now()) / 1000;
  const abs = Math.abs(seconds);

  if (abs < MINUTE) return RELATIVE.format(Math.round(seconds), 'second');
  if (abs < HOUR) return RELATIVE.format(Math.round(seconds / MINUTE), 'minute');
  if (abs < DAY) return RELATIVE.format(Math.round(seconds / HOUR), 'hour');
  if (abs < 7 * DAY) return RELATIVE.format(Math.round(seconds / DAY), 'day');
  if (abs < 30 * DAY) return RELATIVE.format(Math.round(seconds / (7 * DAY)), 'week');
  return RELATIVE.format(Math.round(seconds / (30 * DAY)), 'month');
}
