// Shared by Library.jsx, PlaylistView.jsx and LikedView.jsx — 'custom' means
// "leave as received" (added-at order from the server, or a playlist's own
// manual drag order), everything else is a plain client-side comparator.
export const SORT_OPTIONS = [
  { value: 'custom', label: 'Ordre par défaut' },
  { value: 'title', label: 'Titre' },
  { value: 'artist', label: 'Artiste' },
  { value: 'duration', label: 'Durée' },
];

export function sortTracks(tracks, sortBy) {
  if (sortBy === 'title') return [...tracks].sort((a, b) => a.title.localeCompare(b.title));
  if (sortBy === 'artist') return [...tracks].sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
  if (sortBy === 'duration') return [...tracks].sort((a, b) => (a.duration || 0) - (b.duration || 0));
  return tracks;
}
