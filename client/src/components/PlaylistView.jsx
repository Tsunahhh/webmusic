import { useEffect, useRef, useState } from 'react';
import TrackRow, { PLAYLIST_REORDER_DND_TYPE } from './TrackRow.jsx';
import ContextMenu from './ContextMenu.jsx';
import { useTrackSelection } from '../hooks/useTrackSelection.js';
import { showToast } from '../toast.js';
import { IconPlay, IconTrash, IconImage } from './icons.jsx';

const COVER_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export default function PlaylistView({
  playlistId,
  currentTrackId,
  isPlaying,
  onPlay,
  onEnqueue,
  onChanged,
  playlists,
  onAddToPlaylist,
}) {
  const [playlist, setPlaylist] = useState(null);
  const [menu, setMenu] = useState(null);
  const [coverVersion, setCoverVersion] = useState(0);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const coverInputRef = useRef(null);
  const tracks = playlist?.tracks ?? [];
  const { selectedIds, handleRowClick, dragIdsFor } = useTrackSelection(tracks);

  function load() {
    fetch(`/api/playlists/${playlistId}`)
      .then((res) => res.json())
      .then(setPlaylist);
  }

  useEffect(load, [playlistId]);

  async function removeTrack(trackId) {
    const track = tracks.find((t) => t.id === trackId);
    await fetch(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' });
    load();
    onChanged?.();
    showToast(track ? `« ${track.title} » retiré de la playlist` : 'Piste retirée de la playlist', {
      action: {
        label: 'Annuler',
        onClick: async () => {
          await fetch(`/api/playlists/${playlistId}/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId }),
          });
          load();
          onChanged?.();
        },
      },
    });
  }

  async function uploadCover(file) {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`/api/playlists/${playlistId}/cover`, { method: 'POST', body });
    if (res.ok) {
      setCoverVersion((v) => v + 1);
      load();
      onChanged?.(); // also refreshes the sidebar's playlist list, in case it ever shows covers
    } else {
      const { error } = await res.json().catch(() => ({}));
      showToast(error || 'Échec de l’envoi de l’image');
    }
  }

  async function removeCover(e) {
    e.stopPropagation();
    await fetch(`/api/playlists/${playlistId}/cover`, { method: 'DELETE' });
    setCoverVersion((v) => v + 1);
    load();
  }

  // Playing a track from within this playlist queues the *whole* playlist,
  // rotated to start there, so playback loops continuously through it.
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

  // Drag-reorder within this playlist's own track list — distinct from the
  // TRACK_DND_TYPE drag onto a sidebar playlist (add-to-playlist), see
  // TrackRow.jsx. Updates local state immediately so the row order doesn't
  // snap back while the PUT is in flight; reloads from the server on failure
  // so a rejected (stale) reorder doesn't leave the UI out of sync.
  async function reorderTracks(trackIds) {
    setPlaylist((p) => ({ ...p, tracks: trackIds.map((id) => tracks.find((t) => t.id === id)) }));
    const res = await fetch(`/api/playlists/${playlistId}/tracks/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackIds }),
    });
    if (!res.ok) load();
  }

  function handleReorderDrop(e, targetIndex) {
    setDragOverIndex(null);
    const raw = e.dataTransfer.getData(PLAYLIST_REORDER_DND_TYPE);
    if (raw === '') return;
    const fromIndex = Number(raw);
    if (Number.isNaN(fromIndex) || fromIndex === targetIndex) return;
    const ids = tracks.map((t) => t.id);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(targetIndex, 0, moved);
    reorderTracks(ids);
  }

  if (!playlist) {
    return (
      <div className="view">
        <div className="playlist-header">
          <div className="playlist-cover placeholder-large skeleton-row" />
          <div>
            <span className="eyebrow">Playlist</span>
            <h1 className="skeleton-row skeleton-title">&nbsp;</h1>
          </div>
        </div>
        <ul className="track-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="track-row skeleton-row" />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="playlist-header">
        <div className="playlist-cover-wrap" onClick={() => coverInputRef.current?.click()}>
          {playlist.hasCover ? (
            <img
              className="playlist-cover"
              src={`/api/playlists/${playlistId}/cover?v=${coverVersion}`}
              alt=""
            />
          ) : (
            <div className="playlist-cover placeholder-large">
              <IconImage />
            </div>
          )}
          <div className="playlist-cover-overlay">
            <IconImage />
            <span>{playlist.hasCover ? 'Changer' : 'Ajouter une photo'}</span>
          </div>
          {playlist.hasCover && (
            <button className="icon-button playlist-cover-remove" onClick={removeCover} title="Retirer la photo">
              <IconTrash />
            </button>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept={COVER_ACCEPT}
            className="visually-hidden"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) uploadCover(file);
              e.target.value = '';
            }}
          />
        </div>
        <div>
          <span className="eyebrow">Playlist</span>
          <h1>{playlist.name}</h1>
          <span className="track-count-label">
            {tracks.length} piste{tracks.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <button
        className="play-button-large"
        onClick={() => onPlay(tracks.map((t) => t.id))}
        disabled={tracks.length === 0}
      >
        <IconPlay /> Lire
      </button>

      {tracks.length === 0 ? (
        <p className="empty-hint">Playlist vide — ajoutez des pistes depuis la bibliothèque</p>
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
              reorderable
              dragOverReorder={dragOverIndex === i}
              onReorderDragEnter={setDragOverIndex}
              onReorderDrop={handleReorderDrop}
            >
              <button
                className="icon-button remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTrack(track.id);
                }}
                title="Retirer de la playlist"
              >
                <IconTrash />
              </button>
            </TrackRow>
          ))}
        </ul>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItemsFor(menu.trackIds)} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
