import { useEffect, useState } from 'react';
import TrackRow from './TrackRow.jsx';
import ContextMenu from './ContextMenu.jsx';
import SelectionActions from './SelectionActions.jsx';
import { useTrackSelection } from '../hooks/useTrackSelection.js';
import { formatRelativeTime } from '../format.js';
import { useT } from '../i18n.js';
import { IconHistory } from './icons.jsx';

// "Recently played" — a virtual list like LikedView, backed by the
// play_history table rather than a flag on tracks (see server/src/history.js).
// The server already collapses repeats to one row per track at its most
// recent play, so this renders what it's given.
//
// No sort control, unlike Library/Liked/PlaylistView: recency *is* this view,
// and re-sorting it by title would leave a list with no meaning left. Same
// reasoning as QueueView, which is also ordered by something intrinsic.
export default function HistoryView({ currentTrackId, isPlaying, onPlay, onEnqueue, playlists, onAddToPlaylist, onToggleLike }) {
  const t = useT();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(null);

  // Re-fetches whenever the shared session moves to another track, so a
  // screen left on this view keeps up instead of going stale — the history is
  // the one list that changes on its own while you're looking at it.
  useEffect(() => {
    fetch('/api/library/history')
      .then((res) => res.json())
      .then((data) => {
        setTracks(data);
        setLoading(false);
      });
  }, [currentTrackId]);

  const { selectedIds, handleRowClick, dragIdsFor, clearSelection } = useTrackSelection(tracks);

  function playFrom(trackId) {
    const index = tracks.findIndex((track) => track.id === trackId);
    if (index === -1) return;
    onPlay([...tracks.slice(index), ...tracks.slice(0, index)].map((track) => track.id));
  }

  function handleToggleLike(trackId, liked) {
    setTracks((prev) => prev.map((track) => (track.id === trackId ? { ...track, liked: liked ? 1 : 0 } : track)));
    onToggleLike(trackId, liked);
  }

  function menuItemsFor(trackIds) {
    const items = [{ label: t('menu.addToQueue'), onClick: () => onEnqueue(trackIds) }];
    if (playlists.length > 0) {
      items.push({ label: t('menu.addToPlaylist'), header: true });
      for (const p of playlists) {
        items.push({ label: p.name, onClick: () => onAddToPlaylist(p.id, trackIds) });
      }
    }
    return items;
  }

  return (
    <div className="view">
      <h1 className="history-title">
        <IconHistory /> {t('history.title')}
      </h1>
      {loading ? (
        <ul className="track-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="track-row skeleton-row" />
          ))}
        </ul>
      ) : tracks.length === 0 ? (
        <p className="empty-hint">{t('history.empty')}</p>
      ) : (
        <ul className="track-list">
          {tracks.map((track, i) => (
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
            >
              <span className="track-played-at">{formatRelativeTime(track.lastPlayedAt)}</span>
            </TrackRow>
          ))}
        </ul>
      )}
      <SelectionActions
        ids={Array.from(selectedIds)}
        playlists={playlists}
        onEnqueue={onEnqueue}
        onAddToPlaylist={onAddToPlaylist}
        onClear={clearSelection}
      />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItemsFor(menu.trackIds)} onClose={() => setMenu(null)} />}
    </div>
  );
}
