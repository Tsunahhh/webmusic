import { useCallback, useEffect, useState } from 'react';
import { useSocket } from './hooks/useSocket.js';
import { useTheme } from './hooks/useTheme.js';
import { useDominantColor } from './hooks/useDominantColor.js';
import { isTypingTarget } from './keyboard.js';
import { showToast } from './toast.js';
import Sidebar from './components/Sidebar.jsx';
import Library from './components/Library.jsx';
import PlaylistView from './components/PlaylistView.jsx';
import LikedView from './components/LikedView.jsx';
import QueueView from './components/QueueView.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import ToastHost from './components/ToastHost.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';
import ReconnectBanner from './components/ReconnectBanner.jsx';
import { IconMenu } from './components/icons.jsx';

export default function App() {
  const { state, connected, send, listenerCount } = useSocket();
  const [theme, toggleTheme] = useTheme();
  const [playlists, setPlaylists] = useState([]);
  const [view, setView] = useState({ type: 'library' });
  // Just the ids, for a cheap sidebar count and for TrackRow's heart icon —
  // the actual liked-tracks *data* is fetched by LikedView itself, same
  // split as `playlists` (summary here) vs a playlist's own tracks
  // (fetched by PlaylistView).
  const [likedIds, setLikedIds] = useState(new Set());

  const refreshLiked = useCallback(() => {
    fetch('/api/library/liked')
      .then((res) => res.json())
      .then((data) => setLikedIds(new Set(data.map((t) => t.id))));
  }, []);

  useEffect(refreshLiked, [refreshLiked]);

  // Optimistic: flips the heart (and the sidebar count) immediately, since
  // waiting on the round trip for a same-device toggle would feel laggy for
  // no reason — there's no shared state here to race against (unlike
  // playback), each device's like/unlike is independent.
  function toggleLike(trackId, liked) {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (liked) next.add(trackId);
      else next.delete(trackId);
      return next;
    });
    fetch(`/api/tracks/${trackId}/like`, { method: liked ? 'POST' : 'DELETE' });
  }

  // Tints the main content's background gradient with the current track's
  // cover color — falls back to the static gradient (see index.css) while
  // nothing's playing, the track has no cover, or the light theme is active
  // (a cover's dominant color can land anywhere on the wheel — green, blue,
  // whatever — which clashes with the light theme's deliberately calm,
  // fixed coffee palette; the dark/neon theme has no such constraint).
  const coverUrl = state.track?.hasCover ? `/api/tracks/${state.track.id}/cover` : null;
  const ambient = useDominantColor(coverUrl);
  const mainStyle =
    ambient && theme === 'dark'
      ? { backgroundImage: `linear-gradient(180deg, rgba(${ambient.r}, ${ambient.g}, ${ambient.b}, 0.5) 0%, var(--bg-main) 340px)` }
      : undefined;
  // Off-canvas on narrow viewports only (see the .sidebar CSS media query) —
  // the sidebar stays permanently visible on desktop regardless of this flag.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Picking a destination should also close the mobile drawer — otherwise
  // it'd keep covering the view that just changed underneath it.
  function selectView(next) {
    setView(next);
    setSidebarOpen(false);
  }

  const refreshPlaylists = useCallback(() => {
    fetch('/api/playlists')
      .then((res) => res.json())
      .then(setPlaylists);
  }, []);

  useEffect(refreshPlaylists, [refreshPlaylists]);

  async function createPlaylist(name) {
    await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    refreshPlaylists();
  }

  async function deletePlaylist(id) {
    const playlist = playlists.find((p) => p.id === id);
    // Captured *before* deleting, so "Annuler" can recreate the playlist
    // with the same name, tracks (in order) and cover — the summary list in
    // `playlists` only has a track count, not the actual track ids.
    const detail = await fetch(`/api/playlists/${id}`)
      .then((res) => res.json())
      .catch(() => null);
    const coverBlob = detail?.hasCover
      ? await fetch(`/api/playlists/${id}/cover`)
          .then((res) => (res.ok ? res.blob() : null))
          .catch(() => null)
      : null;

    await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
    if (view.type === 'playlist' && view.id === id) setView({ type: 'library' });
    refreshPlaylists();
    showToast(playlist ? `Playlist "${playlist.name}" supprimée` : 'Playlist supprimée', {
      action: {
        label: 'Annuler',
        onClick: async () => {
          if (!detail) return;
          const created = await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: detail.name }),
          }).then((res) => res.json());
          for (const t of detail.tracks) {
            await fetch(`/api/playlists/${created.id}/tracks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trackId: t.id }),
            });
          }
          if (coverBlob) {
            const body = new FormData();
            body.append('file', coverBlob, 'cover');
            await fetch(`/api/playlists/${created.id}/cover`, { method: 'POST', body });
          }
          refreshPlaylists();
          showToast(`Playlist "${detail.name}" restaurée`);
        },
      },
    });
  }

  async function renamePlaylist(id, name) {
    await fetch(`/api/playlists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    refreshPlaylists();
  }

  async function addTracksToPlaylist(playlistId, trackIds) {
    await Promise.all(
      trackIds.map((trackId) =>
        fetch(`/api/playlists/${playlistId}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId }),
        })
      )
    );
    refreshPlaylists();
    const playlist = playlists.find((p) => p.id === Number(playlistId));
    const label = playlist ? `"${playlist.name}"` : 'la playlist';
    showToast(trackIds.length > 1 ? `${trackIds.length} pistes ajoutées à ${label}` : `Ajouté à ${label}`);
  }

  // The sole "start playing" action: trackIds is always a full, already-
  // ordered context (whole library or whole playlist, rotated to start at
  // whichever track was clicked) — see Library.jsx/PlaylistView.jsx.
  function playQueue(trackIds) {
    send('playQueue', { trackIds });
  }

  function enqueueNext(trackIds) {
    send('enqueueNext', { trackIds });
    showToast(trackIds.length > 1 ? `${trackIds.length} pistes ajoutées à la file` : 'Ajouté à la file d’attente');
  }

  const upcomingCount = state.upNext.length + state.queue.length;

  // Spacebar play/pause — the one keyboard shortcut every media player has.
  // Ignored while typing in an input/textarea so it doesn't fight with text
  // entry. Ctrl/Cmd+K opens global search regardless of focus, like most
  // apps' command palettes — search should stay reachable even *while*
  // typing somewhere else (e.g. the library's own search box).
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (e.code !== 'Space' || !state.track || isTypingTarget()) return;
      e.preventDefault();
      send(state.isPlaying ? 'pause' : 'resume');
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.track, state.isPlaying, send]);

  return (
    <div className="app-shell">
      <ReconnectBanner connected={connected} />

      <button className="mobile-menu-toggle" onClick={() => setSidebarOpen((v) => !v)} title="Menu">
        <IconMenu />
      </button>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        className={sidebarOpen ? 'open' : ''}
        playlists={playlists}
        view={view}
        upcomingCount={upcomingCount}
        likedCount={likedIds.size}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSearch={() => setSearchOpen(true)}
        onSelectLibrary={() => selectView({ type: 'library' })}
        onSelectQueue={() => selectView({ type: 'queue' })}
        onSelectLiked={() => selectView({ type: 'liked' })}
        onSelectPlaylist={(id) => selectView({ type: 'playlist', id })}
        onCreatePlaylist={createPlaylist}
        onDeletePlaylist={deletePlaylist}
        onRenamePlaylist={renamePlaylist}
        onDropTrack={addTracksToPlaylist}
      />

      <main className="main" style={mainStyle}>
        {view.type === 'library' && (
          <Library
            currentTrackId={state.track?.id}
            isPlaying={state.isPlaying}
            onPlay={playQueue}
            onEnqueue={enqueueNext}
            playlists={playlists}
            onAddToPlaylist={addTracksToPlaylist}
            onToggleLike={toggleLike}
          />
        )}
        {view.type === 'playlist' && (
          <PlaylistView
            key={view.id}
            playlistId={view.id}
            currentTrackId={state.track?.id}
            isPlaying={state.isPlaying}
            onPlay={playQueue}
            onEnqueue={enqueueNext}
            onChanged={refreshPlaylists}
            playlists={playlists}
            onAddToPlaylist={addTracksToPlaylist}
            onToggleLike={toggleLike}
          />
        )}
        {view.type === 'liked' && (
          <LikedView
            currentTrackId={state.track?.id}
            isPlaying={state.isPlaying}
            onPlay={playQueue}
            onEnqueue={enqueueNext}
            playlists={playlists}
            onAddToPlaylist={addTracksToPlaylist}
            onToggleLike={toggleLike}
          />
        )}
        {view.type === 'queue' && (
          <QueueView
            state={state}
            onRemoveFromUpNext={(trackId) => send('removeFromUpNext', { trackId })}
            onReorderUpNext={(trackIds) => send('reorderUpNext', { trackIds })}
          />
        )}
      </main>

      <PlayerBar
        state={state}
        connected={connected}
        listenerCount={listenerCount}
        onPause={() => send('pause')}
        onResume={() => send('resume')}
        onStop={() => send('stop')}
        onNext={() => send('next')}
        onSeek={(positionSeconds) => send('seek', { positionSeconds })}
        onShuffle={(enabled) => send('shuffle', { enabled })}
        onRepeat={(mode) => send('repeat', { mode })}
      />

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        playlists={playlists}
        onPlayTrack={playQueue}
        onSelectPlaylist={(id) => selectView({ type: 'playlist', id })}
      />

      <ToastHost />
    </div>
  );
}
