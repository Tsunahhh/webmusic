import { useEffect, useState } from 'react';
import TrackRow from './TrackRow.jsx';
import ContextMenu from './ContextMenu.jsx';
import { useTrackSelection } from '../hooks/useTrackSelection.js';

export default function Library({ currentTrackId, isPlaying, onPlay, onEnqueue, playlists, onAddToPlaylist }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    fetch('/api/library')
      .then((res) => res.json())
      .then((data) => {
        setTracks(data);
        setLoading(false);
      });
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? tracks.filter((t) => t.title.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q))
    : tracks;

  // Selection operates on whatever's currently visible, so Shift+click range
  // selection matches what's on screen when a search filter is active.
  const { selectedIds, handleRowClick, dragIdsFor } = useTrackSelection(filtered);

  // Playing a track from the library queues the *whole* library (not just
  // the filtered view), rotated to start there, so playback continues
  // through everything else afterward.
  function playFrom(trackId) {
    const index = tracks.findIndex((t) => t.id === trackId);
    if (index === -1) return;
    onPlay([...tracks.slice(index), ...tracks.slice(0, index)].map((t) => t.id));
  }

  // Shared by the right-click menu and each row's "more" button (the latter
  // is the only way to reach either action on a touch device — see
  // TrackRow.jsx).
  function menuItemsFor(trackIds) {
    const items = [{ label: 'Ajouter à la file', onClick: () => onEnqueue(trackIds) }];
    if (playlists.length > 0) {
      items.push({ label: 'Ajouter à une playlist', header: true });
      for (const p of playlists) {
        items.push({ label: p.name, onClick: () => onAddToPlaylist(p.id, trackIds) });
      }
    }
    return items;
  }

  return (
    <div className="view">
      <h1>Bibliothèque</h1>
      {loading ? (
        <ul className="track-list">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="track-row skeleton-row" />
          ))}
        </ul>
      ) : tracks.length === 0 ? (
        <p className="empty-hint">Aucune piste — ajoutez des fichiers dans server/music</p>
      ) : (
        <>
          <input
            className="search-input"
            type="search"
            placeholder="Rechercher un titre ou un artiste"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filtered.length === 0 ? (
            <p className="empty-hint">Aucun résultat pour "{query}"</p>
          ) : (
            <ul className="track-list">
              {filtered.map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={i}
                  active={track.id === currentTrackId}
                  isPlaying={isPlaying}
                  selected={selectedIds.has(track.id)}
                  dragIds={dragIdsFor(track.id)}
                  onSelect={(e) => handleRowClick(track, i, e, playFrom)}
                  onOpenMenu={(e, ids) => setMenu({ x: e.clientX, y: e.clientY, trackIds: ids })}
                />
              ))}
            </ul>
          )}
        </>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItemsFor(menu.trackIds)} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
