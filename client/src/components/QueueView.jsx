import { useState } from 'react';
import { formatTime } from '../format.js';
import { IconTrash } from './icons.jsx';
import { useT } from '../i18n.js';
import NowPlayingBars from './NowPlayingBars.jsx';

const REORDER_DND_TYPE = 'application/x-musicweb-upnext-reorder';

// Shared row body (cover, title/artist, duration); `rowProps` carries
// whatever drag handlers/className a given usage needs on the <li> itself —
// the read-only "current track" and "default queue" rows pass none, the
// reorderable up-next rows pass the full drag/drop wiring. `current` (+
// `isPlaying`) only applies to the current-track usage.
function QueueRow({ track, rowProps, current, isPlaying, children }) {
  return (
    <li className="track-row queue-row" {...rowProps}>
      {current && (
        <span className="track-index">
          <NowPlayingBars paused={!isPlaying} />
        </span>
      )}
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
      {children}
    </li>
  );
}

export default function QueueView({ state, onRemoveFromUpNext, onReorderUpNext }) {
  const t = useT();
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const hasCurrent = Boolean(state.track);

  function handleRowDrop(e, targetIndex) {
    e.preventDefault();
    setDragOverIndex(null);

    const fromIndex = Number(e.dataTransfer.getData(REORDER_DND_TYPE));
    if (Number.isNaN(fromIndex)) return;
    const ids = state.upNext.map((track) => track.id);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(targetIndex, 0, moved);
    onReorderUpNext(ids);
  }

  return (
    <div className="view">
      <h1>{t('queue.title')}</h1>

      {hasCurrent && (
        <ul className="track-list">
          <QueueRow track={state.track} current isPlaying={state.isPlaying} />
        </ul>
      )}

      {state.upNext.length > 0 && (
        <ul className="track-list queue-section">
          {state.upNext.map((track, i) => (
            <QueueRow
              key={track.id}
              track={track}
              rowProps={{
                draggable: true,
                className: `track-row queue-row ${dragOverIndex === i ? 'drag-over' : ''}`,
                onDragStart: (e) => {
                  e.dataTransfer.setData(REORDER_DND_TYPE, String(i));
                  e.dataTransfer.effectAllowed = 'move';
                  e.currentTarget.classList.add('dragging');
                },
                onDragEnd: (e) => e.currentTarget.classList.remove('dragging'),
                onDragOver: (e) => e.preventDefault(),
                onDragEnter: () => setDragOverIndex(i),
                onDrop: (e) => handleRowDrop(e, i),
              }}
            >
              <button
                className="icon-button remove-btn"
                onClick={() => onRemoveFromUpNext(track.id)}
                title={t('queue.removeFromQueue')}
              >
                <IconTrash />
              </button>
            </QueueRow>
          ))}
        </ul>
      )}

      {state.queue.length > 0 && (
        <ul className="track-list queue-section">
          {state.queue.map((track) => (
            <QueueRow key={track.id} track={track} />
          ))}
        </ul>
      )}

      {!hasCurrent && state.upNext.length === 0 && state.queue.length === 0 && (
        <p className="empty-hint">{t('queue.empty')}</p>
      )}
    </div>
  );
}
