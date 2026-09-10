import { useRef, useState } from 'react';
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
  IconQrCode,
  IconUser,
  IconHistory,
  IconSliders,
  IconUpload,
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
  onSelectHistory,
  onSelectPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onDropTrack,
  onDropQueue,
  onImportPlaylist,
  onOpenJoin,
  onOpenDisplay,
  deviceName,
  onDeviceNameChange,
  className = '',
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [dragOverId, setDragOverId] = useState(null);
  const [queueDragOver, setQueueDragOver] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [playlistsCollapsed, setPlaylistsCollapsed] = useState(() => localStorage.getItem(PLAYLISTS_COLLAPSED_KEY) === '1');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  // Escape closes the field, which unmounts the input — and an unmount may or
  // may not fire blur depending on how it's dismissed. A flag read (and
  // cleared) by submitName is what makes "cancel" reliable either way; it's
  // reset when opening the field so a cancel can never leak into the next
  // edit. (The playlist rename above submits straight from onBlur because it
  // has no cancel path to protect.)
  const cancelNameRef = useRef(false);
  const importInputRef = useRef(null);

  function startEditName() {
    cancelNameRef.current = false;
    setNameDraft(deviceName);
    setEditingName(true);
  }

  function submitName(e) {
    e.preventDefault();
    setEditingName(false);
    if (cancelNameRef.current) {
      cancelNameRef.current = false;
      return;
    }
    // An empty name is a normal value, not a rejected one: it puts this
    // device back to the anonymous "Un autre appareil" wording.
    onDeviceNameChange(nameDraft.trim().slice(0, 32));
  }

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

      {/* Also a drop target, same TRACK_DND_TYPE payload the playlist items
          below read — dragging onto it is the direct equivalent of the menu's
          "Ajouter à la file". */}
      <button
        className={`nav-item ${view.type === 'queue' ? 'active' : ''} ${queueDragOver ? 'drag-over' : ''}`}
        onClick={onSelectQueue}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragEnter={() => setQueueDragOver(true)}
        onDragLeave={() => setQueueDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setQueueDragOver(false);
          const raw = e.dataTransfer.getData(TRACK_DND_TYPE);
          if (!raw) return;
          onDropQueue(JSON.parse(raw));
        }}
      >
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

      <button className={`nav-item ${view.type === 'history' ? 'active' : ''}`} onClick={onSelectHistory}>
        <span className="nav-item-label">
          <IconHistory /> Écouté récemment
        </span>
      </button>

      <button className="nav-item" onClick={onOpenDisplay}>
        <span className="nav-item-label">
          <IconSliders /> Réglages
        </span>
      </button>

      <button className="nav-item" onClick={onOpenJoin}>
        <span className="nav-item-label">
          <IconQrCode /> Connecter un appareil
        </span>
      </button>

      {editingName ? (
        <form onSubmit={submitName} className="new-playlist-form device-name-form">
          <input
            autoFocus
            value={nameDraft}
            maxLength={32}
            placeholder="Ton nom"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={submitName}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              cancelNameRef.current = true;
              setEditingName(false);
            }}
          />
        </form>
      ) : (
        <button
          className="nav-item device-name-item"
          onClick={startEditName}
          title="Le nom que les autres appareils voient quand tu changes la lecture"
        >
          <span className="nav-item-label">
            <IconUser />
            <span className={deviceName ? '' : 'device-name-unset'}>{deviceName || 'Ton nom'}</span>
          </span>
          <IconEdit />
        </button>
      )}

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
          <button
            className="icon-button"
            onClick={() => importInputRef.current?.click()}
            title="Importer une playlist M3U"
          >
            <IconUpload />
          </button>
          <button className="icon-button" onClick={() => setCreating((v) => !v)} title="Nouvelle playlist">
            <IconPlus />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".m3u,.m3u8,audio/x-mpegurl,audio/mpegurl"
            className="visually-hidden"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) onImportPlaylist(file);
              // Reset so picking the same file twice in a row still fires.
              e.target.value = '';
            }}
          />
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
