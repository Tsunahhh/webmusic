// Shared by Library.jsx, PlaylistView.jsx and LikedView.jsx — 'custom' means
// "leave as received" (added-at order from the server, or a playlist's own
// manual drag order), everything else is a plain client-side comparator.
// `labelKey` rather than a label: the option list is a module constant, built
// once at import time, while the language can change at any moment — so the
// text has to be resolved by the component rendering the <option> (see
// Library.jsx), not baked in here.
export const SORT_OPTIONS = [
  { value: 'custom', labelKey: 'sort.custom' },
  { value: 'title', labelKey: 'sort.title' },
  { value: 'artist', labelKey: 'sort.artist' },
  { value: 'duration', labelKey: 'sort.duration' },
];

export function sortTracks(tracks, sortBy) {
  if (sortBy === 'title') return [...tracks].sort((a, b) => a.title.localeCompare(b.title));
  if (sortBy === 'artist') return [...tracks].sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
  if (sortBy === 'duration') return [...tracks].sort((a, b) => (a.duration || 0) - (b.duration || 0));
  return tracks;
}
