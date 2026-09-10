import { formatTime } from '../format.js';
import NowPlayingBars from './NowPlayingBars.jsx';
import { IconMore, IconHeart } from './icons.jsx';

export const TRACK_DND_TYPE = 'application/x-musicweb-track-ids';
// Distinct from TRACK_DND_TYPE (drag-to-add-to-playlist, read by
// Sidebar.jsx) so a playlist's own track list can tell "drop to reorder
// within this list" apart from "drop onto a different playlist to add" —
// both types are set on the same drag when `reorderable` is on, since
// they're read by different drop targets (see PlaylistView.jsx).
export const PLAYLIST_REORDER_DND_TYPE = 'application/x-musicweb-playlist-reorder';

function setMultiDragImage(e, count) {
  const badge = document.createElement('div');
  badge.className = 'drag-badge';
  badge.textContent = `${count} pistes`;
  document.body.appendChild(badge);
  e.dataTransfer.setDragImage(badge, 16, 16);
  requestAnimationFrame(() => document.body.removeChild(badge));
}

// Shared row markup for both the library list and a playlist's track list —
// the only thing that differs between them is the trailing action
// (none vs. a remove-from-playlist button), passed as children. Every row is
// a drag source (adding a track to a playlist is a drag onto its name in the
// sidebar — see Sidebar.jsx for the drop side) and opens a menu
// ("Ajouter à la file" / "Ajouter à une playlist") two ways: right-click, or
// tapping the always-visible "more" button — the latter is the only way to
// reach either action on a touch device, where there's no right-click and no
// drag-and-drop. `dragIds` is the full set of track ids both drag-to-add and
// the menu act on — more than one when the row is part of a multi-selection
// (see useTrackSelection.js); onSelect receives the raw click event so the
// caller can tell a plain click from a Ctrl/Cmd/Shift one.
//
// `reorderable` (+ `onReorderDragEnter`/`onReorderDrop`/`dragOverReorder`) is
// opt-in, used only by PlaylistView.jsx: when on, `index` doubles as this
// row's position for a second drag-data type (PLAYLIST_REORDER_DND_TYPE) so
// other rows in the *same* list can act as reorder drop targets, independent
// of the add-to-playlist drag above. Reordering always moves the single
// dragged row, regardless of any multi-selection — same convention as
// QueueView's upNext reorder.
export default function TrackRow({
  track,
  index,
  active,
  isPlaying,
  selected,
  dragIds,
  onSelect,
  onOpenMenu,
  onToggleLike,
  children,
  reorderable,
  onReorderDragEnter,
  onReorderDrop,
  dragOverReorder,
}) {
  return (
    <li
      className={`track-row ${active ? 'active' : ''} ${selected ? 'selected' : ''} ${dragOverReorder ? 'drag-over' : ''}`}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMenu(e, dragIds);
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TRACK_DND_TYPE, JSON.stringify(dragIds));
        if (reorderable) e.dataTransfer.setData(PLAYLIST_REORDER_DND_TYPE, String(index));
        e.dataTransfer.effectAllowed = reorderable ? 'copyMove' : 'copy';
        e.currentTarget.classList.add('dragging');
        if (dragIds.length > 1) setMultiDragImage(e, dragIds.length);
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
      onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
      onDragEnter={reorderable ? () => onReorderDragEnter(index) : undefined}
      onDrop={
        reorderable
          ? (e) => {
              e.preventDefault();
              onReorderDrop(e, index);
            }
          : undefined
      }
    >
      <span className="track-index">{active ? <NowPlayingBars paused={!isPlaying} /> : index + 1}</span>
      {track.hasCover ? (
        <img className="track-cover" src={`/api/tracks/${track.id}/cover`} alt="" />
      ) : (
        <div className="track-cover placeholder" />
      )}
      <div className="track-info">
        <span className="track-title">{track.title}</span>
        {track.artist && <span className="track-artist">{track.artist}</span>}
      </div>
      <span className="track-duration">{formatTime(track.duration)}</span>
      {onToggleLike && (
        <button
          className={`icon-button like-btn ${track.liked ? 'liked' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike(track.id, !track.liked);
          }}
          title={track.liked ? 'Retirer des titres likés' : 'Ajouter aux titres likés'}
        >
          <IconHeart filled={Boolean(track.liked)} />
        </button>
      )}
      {children}
      <button
        className="icon-button more-btn"
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu(e, dragIds);
        }}
        title="Plus d’actions"
      >
        <IconMore />
      </button>
    </li>
  );
}
