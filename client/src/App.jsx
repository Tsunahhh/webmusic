import { useCallback, useEffect, useState } from 'react';
import { useSocket } from './hooks/useSocket.js';
import { useTheme } from './hooks/useTheme.js';
import { useDeviceName } from './hooks/useDeviceName.js';
import { useAccent } from './hooks/useAccent.js';
import { useCoverPalette } from './hooks/useCoverPalette.js';
import { useIdle } from './hooks/useIdle.js';
import { useDisplaySettings } from './hooks/useDisplaySettings.js';
import { isTypingTarget } from './keyboard.js';
import { useT } from './i18n.js';
import { showToast } from './toast.js';
import Sidebar from './components/Sidebar.jsx';
import Library from './components/Library.jsx';
import PlaylistView from './components/PlaylistView.jsx';
import LikedView from './components/LikedView.jsx';
import HistoryView from './components/HistoryView.jsx';
import QueueView from './components/QueueView.jsx';
import PlayerBar from './components/PlayerBar.jsx';
import ToastHost from './components/ToastHost.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';
import ReconnectBanner from './components/ReconnectBanner.jsx';
import AmbientMode from './components/AmbientMode.jsx';
import JoinQr from './components/JoinQr.jsx';
import DisplaySettings from './components/DisplaySettings.jsx';
import { IconMenu, IconGear } from './components/icons.jsx';

// Long enough that it never interrupts someone browsing the library, short
// enough that a screen left alone in a living room settles into the ambient
// display within a song or two.
const AMBIENT_DELAY_MS = 3 * 60 * 1000;

export default function App() {
  const t = useT();
  const [deviceName, setDeviceName] = useDeviceName();
  const { state, connected, send, listenerCount } = useSocket(deviceName);
  const [theme, toggleTheme] = useTheme();
  const { settings: display, update: updateDisplay, reset: resetDisplay, warmActive } = useDisplaySettings();
  const [accentId, setAccentId] = useAccent(theme);
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
  const palette = useCoverPalette(coverUrl);
  // The gradient itself lives in CSS (see .main.ambient-mesh in index.css) and
  // only the three colors come from here, as custom properties. That split is
  // what makes the cross-fade between tracks possible: --ambient-N is
  // registered with @property as a <color>, so it can be transitioned, which a
  // whole background-image built inline never could.
  // High contrast opts out entirely: a colored wash over the content is the
  // opposite of what that mode is for.
  const tinted = palette && theme === 'dark' && !display.highContrast && display.ambientIntensity > 0;
  const mainStyle = tinted
    ? Object.fromEntries(
        palette.map((c, i) => [`--ambient-${i + 1}`, `rgba(${c.r}, ${c.g}, ${c.b}, ${display.ambientIntensity})`])
      )
    : undefined;
  // Off-canvas on narrow viewports only (see the .sidebar CSS media query) —
  // the sidebar stays permanently visible on desktop regardless of this flag.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);

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
    // Captured *before* deleting, so the toast's "undo" can recreate the playlist
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
    showToast(playlist ? t('toast.playlistDeleted', { name: playlist.name }) : t('toast.playlistDeletedGeneric'), {
      action: {
        label: t('toast.undo'),
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
          showToast(t('toast.playlistRestored', { name: detail.name }));
        },
      },
    });
  }

  // Always creates a new playlist (see the import route) — importing twice
  // gives two playlists, which is undoable, unlike a silent merge into one the
  // user already had.
  async function importPlaylist(file) {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/playlists/import', { method: 'POST', body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || t('toast.importFailed'));
      return;
    }
    refreshPlaylists();
    setView({ type: 'playlist', id: data.playlist.id });
    // The unmatched count is the part worth surfacing: an import that silently
    // dropped half its entries would otherwise just look like a short playlist.
    const parts = [t('toast.imported', { count: data.imported })];
    if (data.unmatched > 0) parts.push(t('toast.unmatched', { count: data.unmatched }));
    if (data.duplicates > 0) parts.push(t('toast.duplicates', { count: data.duplicates }));
    showToast(parts.join(' · '));
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
    const label = playlist ? `"${playlist.name}"` : t('toast.thePlaylist');
    showToast(
      trackIds.length > 1
        ? t('toast.addedManyToPlaylist', { count: trackIds.length, label })
        : t('toast.addedToPlaylist', { label })
    );
  }

  // The sole "start playing" action: trackIds is always a full, already-
  // ordered context (whole library or whole playlist, rotated to start at
  // whichever track was clicked) — see Library.jsx/PlaylistView.jsx.
  function playQueue(trackIds) {
    send('playQueue', { trackIds });
  }

  function enqueueNext(trackIds) {
    send('enqueueNext', { trackIds });
    showToast(trackIds.length > 1 ? t('toast.addedManyToQueue', { count: trackIds.length }) : t('toast.addedToQueue'));
  }

  const upcomingCount = state.upNext.length + state.queue.length;

  // Only meaningful while something is actually playing: an ambient display
  // over a stopped player would just be a clock covering the UI. Passing that
  // as `enabled` also means playback stopping drops out of ambient mode on
  // its own, without a separate effect to tear it down.
  const ambientIdle = useIdle(AMBIENT_DELAY_MS, Boolean(state.track) && state.isPlaying);

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

      {/* Pinned to the top-right of the app rather than sitting in the
          sidebar: the settings are reachable from every view, and on a phone
          without first opening the drawer. Fixed, so it stays put while the
          main area scrolls under it. */}
      <button className="settings-fab" onClick={() => setDisplayOpen(true)} title={t('nav.settings')}>
        <IconGear />
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
        accentId={accentId}
        onAccentChange={setAccentId}
        onOpenSearch={() => setSearchOpen(true)}
        onSelectLibrary={() => selectView({ type: 'library' })}
        onSelectQueue={() => selectView({ type: 'queue' })}
        onSelectLiked={() => selectView({ type: 'liked' })}
        onSelectHistory={() => selectView({ type: 'history' })}
        onSelectPlaylist={(id) => selectView({ type: 'playlist', id })}
        onCreatePlaylist={createPlaylist}
        onDeletePlaylist={deletePlaylist}
        onRenamePlaylist={renamePlaylist}
        onDropTrack={addTracksToPlaylist}
        onDropQueue={enqueueNext}
        onImportPlaylist={importPlaylist}
        deviceName={deviceName}
        onDeviceNameChange={setDeviceName}
        onOpenJoin={() => {
          setJoinOpen(true);
          setSidebarOpen(false);
        }}
      />

      <main className={`main ${tinted ? 'ambient-mesh' : ''}`} style={mainStyle}>
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
        {view.type === 'history' && (
          <HistoryView
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
        liked={Boolean(state.track && likedIds.has(state.track.id))}
        onToggleLike={toggleLike}
        onPause={() => send('pause')}
        onResume={() => send('resume')}
        onStop={() => send('stop')}
        onNext={() => send('next')}
        onSeek={(positionSeconds) => send('seek', { positionSeconds })}
        onShuffle={(enabled) => send('shuffle', { enabled })}
        onRepeat={(mode) => send('repeat', { mode })}
        onCrossfade={(seconds) => send('crossfade', { seconds })}
      />

      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        playlists={playlists}
        onPlayTrack={playQueue}
        onSelectPlaylist={(id) => selectView({ type: 'playlist', id })}
      />

      {ambientIdle && state.track && <AmbientMode track={state.track} />}

      <JoinQr open={joinOpen} onClose={() => setJoinOpen(false)} />

      <DisplaySettings
        open={displayOpen}
        onClose={() => setDisplayOpen(false)}
        settings={display}
        onChange={updateDisplay}
        onReset={resetDisplay}
        theme={theme}
        crossfadeSeconds={state.crossfadeSeconds ?? 0}
        onCrossfadeChange={(seconds) => send('crossfade', { seconds })}
      />

      {/* Sits above everything, including the ambient screensaver, and never
          takes pointer events — it's a filter over the screen, not a layer of
          the UI. */}
      {warmActive && <div className="warm-overlay" style={{ opacity: display.warmStrength }} />}

      <ToastHost />
    </div>
  );
}
