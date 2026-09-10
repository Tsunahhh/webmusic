import { useEffect, useState } from 'react';
import TrackRow from './TrackRow.jsx';
import ContextMenu from './ContextMenu.jsx';
import { useTrackSelection } from '../hooks/useTrackSelection.js';
import { SORT_OPTIONS, sortTracks } from '../sort.js';
import { IconHeart } from './icons.jsx';

// A virtual playlist, not a real one in the playlists table — just
// GET /api/library/liked filtered server-side by the `liked` flag on
// tracks. Remounts (and so refetches) every time the sidebar nav switches
// into this view, same as Library.jsx does for the full library.
export default function LikedView({ currentTrackId, isPlaying, onPlay, onEnqueue, playlists, onAddToPlaylist, onToggleLike }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('custom');
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    fetch('/api/library/liked')
      .then((res) => res.json())
      .then((data) => {
        setTracks(data);
        setLoading(false);
      });
  }, []);

  const sorted = sortTracks(tracks, sortBy);
  const { selectedIds, handleRowClick, dragIdsFor } = useTrackSelection(sorted);

  function playFrom(trackId) {
    const index = sorted.findIndex((t) => t.id === trackId);
    if (index === -1) return;
    onPlay([...sorted.slice(index), ...sorted.slice(0, index)].map((t) => t.id));
  }

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

  // Unliking a track here should drop it from view immediately — unlike
  // Library.jsx/PlaylistView.jsx, this list *is* the liked set, so "not
  // liked anymore" means "gone from this page", not just a flipped icon.
  function handleToggleLike(trackId, liked) {
    onToggleLike(trackId, liked);
    if (!liked) setTracks((prev) => prev.filter((t) => t.id !== trackId));
  }

  return (
    <div className="view">
      <h1 className="liked-title">
        <IconHeart filled /> Titres likés
      </h1>
      {loading ? (
        <ul className="track-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="track-row skeleton-row" />
          ))}
        </ul>
      ) : tracks.length === 0 ? (
        <p className="empty-hint">Aucun titre liké — cliquez le cœur sur une piste pour l’ajouter ici</p>
      ) : (
        <>
          <div className="sort-row">
            <label>
              Trier par
              <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="track-list">
            {sorted.map((track, i) => (
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
                onToggleLike={handleToggleLike}
              />
            ))}
          </ul>
        </>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItemsFor(menu.trackIds)} onClose={() => setMenu(null)} />}
    </div>
  );
}
