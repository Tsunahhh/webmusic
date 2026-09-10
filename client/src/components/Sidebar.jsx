import { useState } from 'react';
import { IconPlus, IconTrash, IconMusicNote, IconQueue, IconSun, IconMoon } from './icons.jsx';
import { TRACK_DND_TYPE } from './TrackRow.jsx';

export default function Sidebar({
  playlists,
  view,
  upcomingCount,
  theme,
  onToggleTheme,
  onSelectLibrary,
  onSelectQueue,
  onSelectPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  onDropTrack,
  className = '',
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [dragOverId, setDragOverId] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreatePlaylist(name.trim());
    setName('');
    setCreating(false);
  }

  return (
    <nav className={`sidebar ${className}`}>
      <div className="brand">
        <span className="brand-label">
          <IconMusicNote />
          <span>MusicWeb</span>
        </span>
        <button
          className="icon-button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </div>

      <button className={`nav-item ${view.type === 'library' ? 'active' : ''}`} onClick={onSelectLibrary}>
        Bibliothèque
      </button>

      <button className={`nav-item ${view.type === 'queue' ? 'active' : ''}`} onClick={onSelectQueue}>
        <span className="nav-item-label">
          <IconQueue /> File d'attente
        </span>
        {upcomingCount > 0 && <span className="track-count">{upcomingCount}</span>}
      </button>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Playlists</span>
          <button className="icon-button" onClick={() => setCreating((v) => !v)} title="Nouvelle playlist">
            <IconPlus />
          </button>
        </div>

        {creating && (
          <form onSubmit={submit} className="new-playlist-form">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => !name.trim() && setCreating(false)}
              placeholder="Nom de la playlist"
            />
          </form>
        )}

        <ul className="playlist-nav">
          {playlists.map((p) => (
            <li
              key={p.id}
              className={`playlist-nav-item ${dragOverId === p.id ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDragEnter={() => setDragOverId(p.id)}
              onDragLeave={() => setDragOverId((id) => (id === p.id ? null : id))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverId(null);
                const raw = e.dataTransfer.getData(TRACK_DND_TYPE);
                if (!raw) return;
                onDropTrack(p.id, JSON.parse(raw));
              }}
            >
              <button
                className={`nav-item ${view.type === 'playlist' && view.id === p.id ? 'active' : ''}`}
                onClick={() => onSelectPlaylist(p.id)}
              >
                <span className="playlist-name">{p.name}</span>
                <span className="track-count">{p.trackCount}</span>
              </button>
              <button
                className="icon-button delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePlaylist(p.id);
                }}
                title="Supprimer la playlist"
              >
                <IconTrash />
              </button>
            </li>
          ))}
          {playlists.length === 0 && <li className="empty-hint">Aucune playlist</li>}
        </ul>
      </div>
    </nav>
  );
}
