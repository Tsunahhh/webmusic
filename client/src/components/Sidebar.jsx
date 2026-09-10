import { useState } from 'react';
import {
  IconPlus,
  IconTrash,
  IconMusicNote,
  IconQueue,
  IconSun,
  IconMoon,
  IconSearch,
  IconHeart,
  IconEdit,
  IconChevron,
} from './icons.jsx';
import { ACCENT_PRESETS } from '../hooks/useAccent.js';
import { TRACK_DND_TYPE } from './TrackRow.jsx';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);
const PLAYLISTS_COLLAPSED_KEY = 'musicweb-playlists-collapsed';

export default function Sidebar({
  playlists,
  view,
  upcomingCount,
  likedCount,
  theme,
  onToggleTheme,
  accentId,
  onAccentChange,
  onOpenSearch,
  onSelectLibrary,
  onSelectQueue,
  onSelectLiked,
  onSelectPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onDropTrack,
  className = '',
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [dragOverId, setDragOverId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [playlistsCollapsed, setPlaylistsCollapsed] = useState(() => localStorage.getItem(PLAYLISTS_COLLAPSED_KEY) === '1');

  function togglePlaylistsCollapsed() {
    setPlaylistsCollapsed((v) => {
      localStorage.setItem(PLAYLISTS_COLLAPSED_KEY, v ? '0' : '1');
      return !v;
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreatePlaylist(name.trim());
    setName('');
    setCreating(false);
  }

  function startRename(p) {
    setRenamingId(p.id);
    setRenameValue(p.name);
  }

  async function submitRename(e) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed) return;
    await onRenamePlaylist(renamingId, trimmed);
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

      {theme === 'dark' && (
        <div className="accent-picker">
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`accent-swatch ${accentId === p.id ? 'active' : ''}`}
              style={{ background: p.hex }}
              onClick={() => onAccentChange(p.id)}
              title={p.label}
            />
          ))}
        </div>
      )}

      <button className="nav-item search-trigger" onClick={onOpenSearch}>
        <span className="nav-item-label">
          <IconSearch /> Rechercher
        </span>
        <span className="shortcut-hint">{IS_MAC ? '⌘K' : 'Ctrl K'}</span>
      </button>

      <button className={`nav-item ${view.type === 'library' ? 'active' : ''}`} onClick={onSelectLibrary}>
        Bibliothèque
      </button>

      <button className={`nav-item ${view.type === 'queue' ? 'active' : ''}`} onClick={onSelectQueue}>
        <span className="nav-item-label">
          <IconQueue /> File d'attente
        </span>
        {upcomingCount > 0 && <span className="track-count">{upcomingCount}</span>}
      </button>

      <button className={`nav-item ${view.type === 'liked' ? 'active' : ''}`} onClick={onSelectLiked}>
        <span className="nav-item-label">
          <IconHeart filled={likedCount > 0} /> Titres likés
        </span>
        {likedCount > 0 && <span className="track-count">{likedCount}</span>}
      </button>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <button
            className="sidebar-section-toggle"
            onClick={togglePlaylistsCollapsed}
            title={playlistsCollapsed ? 'Déplier les playlists' : 'Replier les playlists'}
          >
            <IconChevron className={playlistsCollapsed ? 'collapsed' : ''} />
            <span>Playlists</span>
          </button>
          <button className="icon-button" onClick={() => setCreating((v) => !v)} title="Nouvelle playlist">
            <IconPlus />
          </button>
        </div>

        {!playlistsCollapsed && (
          <>
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
                  {renamingId === p.id ? (
                    <form onSubmit={submitRename} className="new-playlist-form playlist-rename-form">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={submitRename}
                        onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                      />
                    </form>
                  ) : (
                    <>
                      <button
                        className={`nav-item ${view.type === 'playlist' && view.id === p.id ? 'active' : ''}`}
                        onClick={() => onSelectPlaylist(p.id)}
                      >
                        <span className="playlist-name">{p.name}</span>
                        <span className="track-count">{p.trackCount}</span>
                      </button>
                      <button
                        className="icon-button rename-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(p);
                        }}
                        title="Renommer la playlist"
                      >
                        <IconEdit />
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
                    </>
                  )}
                </li>
              ))}
              {playlists.length === 0 && <li className="empty-hint">Aucune playlist</li>}
            </ul>
          </>
        )}
      </div>
    </nav>
  );
}
